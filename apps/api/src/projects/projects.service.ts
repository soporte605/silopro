import { Inject, Injectable } from '@nestjs/common';
import type {
  BomLineStatus,
  BomSource,
  bomLineInputSchema,
  bomLineUpdateSchema,
  ProjectDetail,
  projectInputSchema,
  ProjectStatus,
  ProjectSummary,
  ReserveAllResult,
} from '@silopro/contracts';
import { allocate, bomLineStatus, fromScaled, toScaled } from '@silopro/domain';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound, staleVersion } from '../common/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import { iso, num0 } from '../db/mappers.js';
import { bomLines, projects, users } from '../db/schema.js';
import { MovementsService } from '../stock/movements.service.js';
import { ReservationsService } from '../stock/reservations.service.js';

type ProjectData = z.output<typeof projectInputSchema>;
type LineData = z.output<typeof bomLineInputSchema>;
type LineUpdate = z.output<typeof bomLineUpdateSchema>;

/** Estados en los que el proyecto todavía aparta material. */
const OPEN: readonly ProjectStatus[] = ['draft', 'active'];

type LineRow = {
  id: string;
  project_id: string;
  item_id: string;
  sku: string;
  name: string;
  symbol: string;
  notes: string | null;
  quantity: string;
  consumed: string;
  reserved: string;
  available: string;
};

/**
 * Proyectos con lista de materiales. El estado de cada línea se calcula al
 * consultarla a partir de las reservas del proyecto y de las existencias, así
 * que nunca se desincroniza del inventario.
 */
@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(MovementsService) private readonly movements: MovementsService,
    @Inject(ReservationsService) private readonly reservations: ReservationsService,
  ) {}

  list(ctx: OrgContext, filter: { status?: ProjectStatus }): Promise<ProjectSummary[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const rows = await this.projectRows(
        tx,
        filter.status ? eq(projects.status, filter.status) : undefined,
        500,
      );
      if (!rows.length) return [];
      const ids = sql.join(
        rows.map((r) => sql`${r.p.id}`),
        sql`, `,
      );
      const lines = await this.lineRows(tx, sql`bl.project_id in (${ids})`);
      return rows.map((r) =>
        this.summary(
          r,
          lines.filter((l) => l.project_id === r.p.id),
        ),
      );
    });
  }

  get(ctx: OrgContext, id: string): Promise<ProjectDetail> {
    return this.dbs.tenant(ctx, (tx) => this.detail(tx, id));
  }

  create(ctx: OrgContext, input: ProjectData): Promise<ProjectDetail> {
    return this.dbs.tenant(ctx, async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId })
        .returning({ id: projects.id });
      return this.detail(tx, row!.id);
    });
  }

  update(
    ctx: OrgContext,
    id: string,
    input: ProjectData & { version: number },
  ): Promise<ProjectDetail> {
    return this.dbs.tenant(ctx, async (tx) => {
      const { version, ...data } = input;
      const [row] = await tx
        .update(projects)
        .set({ ...data, version: sql`${projects.version} + 1`, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.version, version)))
        .returning({ id: projects.id });
      if (!row) {
        await this.lock(tx, id);
        throw staleVersion();
      }
      return this.detail(tx, id);
    });
  }

  /** Agrega un artículo; si ya estaba en la lista, suma la cantidad. */
  addLine(ctx: OrgContext, projectId: string, input: LineData): Promise<ProjectDetail> {
    return this.dbs.tenant(ctx, async (tx) => {
      await this.lock(tx, projectId);
      await this.movements.item(tx, input.itemId);
      const [{ next } = { next: 0 }] = await tx
        .select({ next: sql<number>`coalesce(max(${bomLines.position}) + 1, 0)::int` })
        .from(bomLines)
        .where(eq(bomLines.projectId, projectId));
      await tx
        .insert(bomLines)
        .values({
          organizationId: ctx.organizationId,
          projectId,
          itemId: input.itemId,
          quantity: String(input.quantity),
          notes: input.notes,
          position: next,
        })
        .onConflictDoUpdate({
          target: [bomLines.projectId, bomLines.itemId],
          set: {
            quantity: sql`${bomLines.quantity} + excluded.quantity`,
            notes: sql`coalesce(excluded.notes, ${bomLines.notes})`,
            updatedAt: new Date(),
          },
        });
      return this.detail(tx, projectId);
    });
  }

  updateLine(
    ctx: OrgContext,
    projectId: string,
    lineId: string,
    input: LineUpdate,
  ): Promise<ProjectDetail> {
    return this.dbs.tenant(ctx, async (tx) => {
      await this.lock(tx, projectId);
      const [row] = await tx
        .update(bomLines)
        .set({ quantity: String(input.quantity), notes: input.notes, updatedAt: new Date() })
        .where(and(eq(bomLines.id, lineId), eq(bomLines.projectId, projectId)))
        .returning({ id: bomLines.id });
      if (!row) throw notFound('Línea');
      return this.detail(tx, projectId);
    });
  }

  /** Quita un artículo de la lista; sus reservas siguen activas hasta liberarlas. */
  removeLine(ctx: OrgContext, projectId: string, lineId: string): Promise<ProjectDetail> {
    return this.dbs.tenant(ctx, async (tx) => {
      await this.lock(tx, projectId);
      const [row] = await tx
        .delete(bomLines)
        .where(and(eq(bomLines.id, lineId), eq(bomLines.projectId, projectId)))
        .returning({ id: bomLines.id });
      if (!row) throw notFound('Línea');
      return this.detail(tx, projectId);
    });
  }

  /**
   * Aparta para el proyecto todo lo pendiente que haya libre, tomando primero
   * de las ubicaciones con más existencias. Lo que no alcanza queda como faltante.
   */
  reserveAll(ctx: OrgContext, projectId: string): Promise<ReserveAllResult> {
    return this.dbs.tenant(ctx, async (tx) => {
      const p = await this.lock(tx, projectId);
      if (!OPEN.includes(p.status)) {
        throw invalid('El proyecto está cerrado', { code: 'PROJECT_CLOSED', status: p.status });
      }
      const lines = await this.lineRows(tx, sql`bl.project_id = ${projectId}`);
      const sources = await this.sourceRows(
        tx,
        lines.map((l) => l.item_id),
      );
      let created = 0;
      for (const l of lines) {
        const { pending } = bomLineStatus(this.scaled(l));
        if (pending <= 0) continue;
        // Releer con bloqueo: otra persona pudo apartar o sacar entretanto.
        const fresh: { locationId: string; available: number }[] = [];
        for (const s of sources.get(l.item_id) ?? []) {
          const level = await this.movements.lockLevel(tx, ctx, l.item_id, s.locationId);
          fresh.push({
            locationId: s.locationId,
            available: toScaled(num0(level.onHand)) - toScaled(num0(level.reserved)),
          });
        }
        for (const pick of allocate(pending, fresh).picks) {
          await this.reservations.createInTx(tx, ctx, {
            itemId: l.item_id,
            locationId: pick.source.locationId,
            quantity: fromScaled(pick.quantity),
            purpose: `${p.code} · ${p.name}`,
            projectId,
          });
          created++;
        }
      }
      return { project: await this.detail(tx, projectId), created };
    });
  }

  /** Devuelve a disponible todo lo apartado para el proyecto y aún sin consumir. */
  releaseAll(ctx: OrgContext, projectId: string): Promise<ProjectDetail> {
    return this.dbs.tenant(ctx, async (tx) => {
      await this.lock(tx, projectId);
      const active = await this.reservations.listInTx(tx, { projectId, status: 'active' });
      for (const r of active) await this.reservations.releaseInTx(tx, ctx, r.id);
      return this.detail(tx, projectId);
    });
  }

  private async lock(tx: Tx, id: string) {
    const [p] = await tx.select().from(projects).where(eq(projects.id, id)).for('update');
    if (!p) throw notFound('Proyecto');
    return p;
  }

  private async detail(tx: Tx, id: string): Promise<ProjectDetail> {
    const [row] = await this.projectRows(tx, eq(projects.id, id), 1);
    if (!row) throw notFound('Proyecto');
    const lines = await this.lineRows(tx, sql`bl.project_id = ${id}`);
    const sources = await this.sourceRows(
      tx,
      lines.map((l) => l.item_id),
    );
    return {
      ...this.summary(row, lines),
      lines: lines.map((l) => this.lineStatus(l, sources.get(l.item_id) ?? [])),
      reservations: await this.reservations.listInTx(tx, { projectId: id }),
    };
  }

  private projectRows(tx: Tx, where: SQL | undefined, limit: number) {
    return tx
      .select({ p: projects, createdByName: users.name })
      .from(projects)
      .innerJoin(users, eq(users.id, projects.createdBy))
      .where(where)
      .orderBy(desc(projects.createdAt), desc(projects.id))
      .limit(limit);
  }

  /** Líneas con lo consumido y reservado para su proyecto y lo libre en almacén. */
  private async lineRows(tx: Tx, where: SQL): Promise<LineRow[]> {
    const res = await tx.execute<LineRow>(sql`
      select bl.id, bl.project_id, bl.item_id, i.sku, i.name, u.symbol, bl.notes, bl.quantity,
        coalesce((select sum(r.consumed) from reservations r
          where r.project_id = bl.project_id and r.item_id = bl.item_id), 0) as consumed,
        coalesce((select sum(r.quantity - r.consumed) from reservations r
          where r.project_id = bl.project_id and r.item_id = bl.item_id
            and r.status = 'active'), 0) as reserved,
        coalesce((select sum(s.on_hand - s.reserved) from stock_levels s
          join locations l on l.id = s.location_id
          where s.item_id = bl.item_id and l.archived_at is null
            and s.on_hand > s.reserved), 0) as available
      from bom_lines bl
      join items i on i.id = bl.item_id
      join units u on u.id = i.unit_id
      where ${where}
      order by bl.position, bl.created_at`);
    return res.rows;
  }

  /** Ubicaciones con existencias libres de cada artículo, de más a menos. */
  private async sourceRows(tx: Tx, itemIds: string[]): Promise<Map<string, BomSource[]>> {
    const map = new Map<string, BomSource[]>();
    if (!itemIds.length) return map;
    const res = await tx.execute<{
      item_id: string;
      location_id: string;
      path: string;
      cabinet_id: string | null;
      available: string;
    }>(sql`
      select s.item_id, s.location_id, l.path, c.id as cabinet_id,
        s.on_hand - s.reserved as available
      from stock_levels s
      join locations l on l.id = s.location_id
      left join cabinets c on c.location_id = l.parent_id
      where s.item_id in (${sql.join(
        [...new Set(itemIds)].map((i) => sql`${i}`),
        sql`, `,
      )})
        and l.archived_at is null and s.on_hand > s.reserved
      order by s.on_hand - s.reserved desc, l.path`);
    for (const r of res.rows) {
      const list = map.get(r.item_id) ?? [];
      list.push({
        locationId: r.location_id,
        locationPath: r.path,
        cabinetId: r.cabinet_id,
        available: num0(r.available),
      });
      map.set(r.item_id, list);
    }
    return map;
  }

  private scaled(l: LineRow) {
    return {
      required: toScaled(num0(l.quantity)),
      consumed: toScaled(num0(l.consumed)),
      reserved: toScaled(num0(l.reserved)),
      available: toScaled(num0(l.available)),
    };
  }

  private lineStatus(l: LineRow, sources: BomSource[]): BomLineStatus {
    const s = this.scaled(l);
    const { pending, shortage } = bomLineStatus(s);
    return {
      id: l.id,
      itemId: l.item_id,
      sku: l.sku,
      itemName: l.name,
      unitSymbol: l.symbol,
      notes: l.notes,
      required: fromScaled(s.required),
      consumed: fromScaled(s.consumed),
      reserved: fromScaled(s.reserved),
      pending: fromScaled(pending),
      available: fromScaled(s.available),
      shortage: fromScaled(shortage),
      sources,
    };
  }

  private summary(
    r: { p: typeof projects.$inferSelect; createdByName: string },
    lines: LineRow[],
  ): ProjectSummary {
    let shortageCount = 0;
    let coveredCount = 0;
    for (const l of lines) {
      const { pending, shortage } = bomLineStatus(this.scaled(l));
      if (shortage > 0) shortageCount++;
      if (pending === 0) coveredCount++;
    }
    return {
      id: r.p.id,
      code: r.p.code,
      name: r.p.name,
      description: r.p.description,
      status: r.p.status,
      dueDate: r.p.dueDate,
      lineCount: lines.length,
      shortageCount,
      coveredCount,
      createdByName: r.createdByName,
      createdAt: iso(r.p.createdAt),
      version: r.p.version,
    };
  }
}
