import type { INestApplication } from '@nestjs/common';
import type { AuditPage, MovementPage } from '@silopro/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createApp,
  db,
  pieceUnitId,
  type Session,
  signUp,
  TEST_DB,
  uniqueEmail,
} from './helpers.js';

describe.skipIf(!TEST_DB)('auditoría y diario de movimientos', () => {
  let app: INestApplication;
  let s: Session;
  let itemId: string;
  let unitId: string;
  let binA: string;
  let binB: string;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Auditora');
    unitId = await pieceUnitId(s);
    const wh = (
      await s
        .post('/locations')
        .send({ kind: 'warehouse', code: 'ALM', name: 'Almacén' })
        .expect(201)
    ).body;
    binA = (
      await s
        .post('/locations')
        .send({ kind: 'bin', code: 'A', name: 'A', parentId: wh.id })
        .expect(201)
    ).body.id;
    binB = (
      await s
        .post('/locations')
        .send({ kind: 'bin', code: 'B', name: 'B', parentId: wh.id })
        .expect(201)
    ).body.id;
    itemId = (
      await s.post('/items').send({ sku: 'AUD-1', name: 'Relevador 5 V', unitId }).expect(201)
    ).body.id;
  });
  afterAll(async () => app?.close());

  it('registra cada cambio con quién, qué y cuándo, sin secretos', async () => {
    await s
      .patch(`/items/${itemId}`)
      .send({ sku: 'AUD-1', name: 'Relevador 5 V doble', unitId, version: 1 })
      .expect(200);
    const page: AuditPage = (await s.get('/audit').expect(200)).body;
    const actions = page.entries.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['POST locations', 'POST items', 'PATCH items/:id']),
    );
    const edit = page.entries.find((e) => e.action === 'PATCH items/:id')!;
    expect(edit).toMatchObject({ entityId: itemId, actorName: 'Auditora' });
    expect(edit.label).toContain('AUD-1');
    expect(edit.details).toMatchObject({ name: 'Relevador 5 V doble' });
    // Las lecturas no se registran.
    expect(actions.some((a) => a.startsWith('GET'))).toBe(false);
    // Filtro por registro y paginación.
    const one: AuditPage = (await s.get(`/audit?entityId=${itemId}&limit=1`).expect(200)).body;
    expect(one.entries).toHaveLength(1);
    expect(one.nextCursor).toBe(one.entries[0]!.id);
    const next: AuditPage = (
      await s.get(`/audit?entityId=${itemId}&limit=1&before=${one.nextCursor}`).expect(200)
    ).body;
    expect(next.entries[0]!.action).toBe('POST items');
  });

  it('es de solo inserción y solo la ven quienes administran', async () => {
    const ctx = { userId: s.userId, organizationId: s.orgId };
    await expect(
      db(app).tenant(ctx, (tx) => tx.execute(sql`update audit_log set action = 'x'`)),
    ).rejects.toThrow();
    await expect(
      db(app).tenant(ctx, (tx) => tx.execute(sql`delete from audit_log`)),
    ).rejects.toThrow();
    const forced = await db(app).db.execute<{ forced: boolean }>(
      sql`select relforcerowsecurity as forced from pg_class where relname = 'audit_log'`,
    );
    expect(forced.rows[0]?.forced).toBe(true);

    const email = uniqueEmail('op');
    const inv = (await s.post('/invitations').send({ email, role: 'operator' }).expect(201)).body;
    const path = new URL(inv.url as string).pathname.replace(
      /^\/invitacion\//,
      '/api/invitations/',
    );
    const op = await signUp(app, 'Operador', email);
    await op.post(`${path}/accept`).expect(200);
    await op.get(`/api/orgs/${s.orgId}/audit`).expect(403);
    // Otra organización no ve nada de esta.
    const other = await signUp(app, 'Otra');
    expect(
      ((await other.get('/audit').expect(200)).body as AuditPage).entries.every(
        (e) => e.actorName !== 'Auditora',
      ),
    ).toBe(true);
  });

  it('diario de movimientos: filtros, cursor y CSV para Excel', async () => {
    await s
      .post('/movements')
      .send({ kind: 'receipt', itemId, locationId: binA, quantity: 10, reason: '=CMD()' })
      .expect(201);
    await s
      .post('/transfers')
      .send({ itemId, fromLocationId: binA, toLocationId: binB, quantity: 4 })
      .expect(201);
    const all: MovementPage = (await s.get('/movements').expect(200)).body;
    expect(all.movements.map((m) => m.kind)).toEqual(['transfer', 'transfer', 'receipt']);
    expect(all.movements[0]).toMatchObject({ sku: 'AUD-1', unitSymbol: expect.any(String) });
    const receipts: MovementPage = (await s.get('/movements?kind=receipt').expect(200)).body;
    expect(receipts.movements).toHaveLength(1);
    const inB: MovementPage = (await s.get(`/movements?locationId=${binB}`).expect(200)).body;
    expect(inB.movements.map((m) => m.delta)).toEqual([4]);
    const paged: MovementPage = (await s.get('/movements?limit=2').expect(200)).body;
    expect(paged.nextCursor).not.toBeNull();
    const rest: MovementPage = (
      await s.get(`/movements?limit=2&before=${paged.nextCursor}`).expect(200)
    ).body;
    expect(rest.movements.map((m) => m.kind)).toEqual(['receipt']);
    await s.get('/movements?from=2026-13-01').expect(400);

    const csv = await s.get('/movements/export?kind=receipt').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const text = csv.text.replace(/^\uFEFF/, '');
    const [head, row] = text.trim().split('\r\n');
    expect(head).toBe('Fecha,Tipo,SKU,Artículo,Ubicación,Cantidad,Unidad,Motivo,Quién');
    expect(row).toContain('Entrada,AUD-1,Relevador 5 V doble,ALM / A,10');
    // Una fórmula en el motivo no se ejecuta al abrirlo en Excel.
    expect(row).toContain(`'=CMD()`);
  });
});
