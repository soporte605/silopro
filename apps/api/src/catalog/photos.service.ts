import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  StreamableFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  type ItemPhoto,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ITEM,
  type PhotoSize,
} from '@silopro/contracts';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { v7 as uuidv7 } from 'uuid';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound } from '../common/http.js';
import { ENV, type Env } from '../config/env.js';
import { assertWithinPlan } from '../billing/plan-limits.js';
import { DbService, type Tx } from '../db/db.service.js';
import { itemPhotos, items } from '../db/schema.js';

/** Formatos aceptados según el contenido real del archivo (no su extensión). */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
/** Protección contra «bombas de descompresión»: ~40 megapíxeles. */
const MAX_INPUT_PIXELS = 40_000_000;
const SIZES: Record<PhotoSize, number> = { full: 2000, thumb: 480 };

/**
 * Fotografías de artículos.
 *
 * Cada imagen se re-codifica a WebP: se aplica la orientación EXIF y se
 * descartan todos los metadatos (GPS, cámara, fecha). Los archivos viven en
 * UPLOADS_DIR con nombres derivados solo de UUIDs, fuera de cualquier raíz
 * web, y se sirven tras comprobar sesión, organización y permiso.
 */
@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);
  private readonly root: string;

  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(ENV) env: Env,
  ) {
    this.root = resolve(env.UPLOADS_DIR);
  }

  list(ctx: OrgContext, itemId: string): Promise<ItemPhoto[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      await this.assertItem(tx, itemId);
      const rows = await tx
        .select()
        .from(itemPhotos)
        .where(eq(itemPhotos.itemId, itemId))
        .orderBy(asc(itemPhotos.position), asc(itemPhotos.createdAt));
      return rows.map(toDto);
    });
  }

  async upload(ctx: OrgContext, itemId: string, file: Buffer | undefined): Promise<ItemPhoto> {
    if (!file?.length) throw invalid('Adjunte una imagen en el campo «file»');
    if (file.length > MAX_PHOTO_BYTES) throw invalid('La imagen supera el tamaño máximo');

    const encoded = await encode(file);
    const id = uuidv7();
    const dir = join(this.root, ctx.organizationId);
    await mkdir(dir, { recursive: true });
    // Se escribe con nombre temporal y se renombra: nunca queda un archivo a medias.
    const paths = this.paths(ctx.organizationId, id);
    await Promise.all([
      writeFile(`${paths.full}.tmp`, encoded.full.data),
      writeFile(`${paths.thumb}.tmp`, encoded.thumb.data),
    ]);
    await Promise.all([
      rename(`${paths.full}.tmp`, paths.full),
      rename(`${paths.thumb}.tmp`, paths.thumb),
    ]);

    try {
      return await this.dbs.tenant(ctx, async (tx) => {
        // Bloquea el artículo para que dos subidas simultáneas no superen el límite.
        await this.assertItem(tx, itemId, true);
        await assertWithinPlan(tx, ctx.organizationId, 'photoBytes', encoded.full.info.size);
        const [{ n } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(itemPhotos)
          .where(eq(itemPhotos.itemId, itemId));
        if (n >= MAX_PHOTOS_PER_ITEM) {
          throw invalid(`Máximo ${MAX_PHOTOS_PER_ITEM} fotografías por artículo`);
        }
        const [{ next } = { next: 0 }] = await tx
          .select({ next: sql<number>`coalesce(max(${itemPhotos.position}) + 1, 0)::int` })
          .from(itemPhotos)
          .where(eq(itemPhotos.itemId, itemId));
        const [row] = await tx
          .insert(itemPhotos)
          .values({
            id,
            organizationId: ctx.organizationId,
            itemId,
            width: encoded.full.info.width,
            height: encoded.full.info.height,
            bytes: encoded.full.info.size,
            position: next,
            createdBy: ctx.userId,
          })
          .returning();
        return toDto(row!);
      });
    } catch (e) {
      await this.removeFiles(ctx.organizationId, id);
      throw e;
    }
  }

  async file(ctx: OrgContext, itemId: string, photoId: string, size: PhotoSize) {
    await this.dbs.tenant(ctx, async (tx) => {
      const [row] = await tx
        .select({ id: itemPhotos.id })
        .from(itemPhotos)
        .where(and(eq(itemPhotos.id, photoId), eq(itemPhotos.itemId, itemId)));
      if (!row) throw notFound('Fotografía');
    });
    const path = this.paths(ctx.organizationId, photoId)[size];
    const info = await stat(path).catch(() => null);
    if (!info) throw notFound('Fotografía');
    return new StreamableFile(createReadStream(path), {
      type: 'image/webp',
      length: info.size,
      disposition: 'inline',
    });
  }

  /** Mueve la fotografía al primer lugar (portada). */
  async makeCover(ctx: OrgContext, itemId: string, photoId: string): Promise<ItemPhoto[]> {
    await this.dbs.tenant(ctx, async (tx) => {
      await this.assertItem(tx, itemId, true);
      const rows = await tx
        .select({ id: itemPhotos.id })
        .from(itemPhotos)
        .where(eq(itemPhotos.itemId, itemId))
        .orderBy(asc(itemPhotos.position), asc(itemPhotos.createdAt));
      if (!rows.some((r) => r.id === photoId)) throw notFound('Fotografía');
      const order = [photoId, ...rows.map((r) => r.id).filter((id) => id !== photoId)];
      for (const [position, id] of order.entries()) {
        await tx.update(itemPhotos).set({ position }).where(eq(itemPhotos.id, id));
      }
    });
    return this.list(ctx, itemId);
  }

  async remove(ctx: OrgContext, itemId: string, photoId: string): Promise<void> {
    await this.dbs.tenant(ctx, async (tx) => {
      const res = await tx
        .delete(itemPhotos)
        .where(and(eq(itemPhotos.id, photoId), eq(itemPhotos.itemId, itemId)))
        .returning({ id: itemPhotos.id });
      if (!res.length) throw notFound('Fotografía');
    });
    // Tras confirmar la transacción; un fallo aquí solo deja un archivo huérfano.
    await this.removeFiles(ctx.organizationId, photoId);
  }

  private paths(orgId: string, photoId: string): Record<PhotoSize, string> {
    const dir = join(this.root, orgId);
    return { full: join(dir, `${photoId}-full.webp`), thumb: join(dir, `${photoId}-thumb.webp`) };
  }

  private async removeFiles(orgId: string, photoId: string): Promise<void> {
    const p = this.paths(orgId, photoId);
    for (const f of [p.full, p.thumb, `${p.full}.tmp`, `${p.thumb}.tmp`]) {
      await rm(f, { force: true }).catch((e: unknown) =>
        this.logger.warn(`No se pudo borrar ${f}: ${String(e)}`),
      );
    }
  }

  private async assertItem(tx: Tx, itemId: string, lock = false): Promise<void> {
    const q = tx
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.id, itemId), isNull(items.archivedAt)));
    const [row] = lock ? await q.for('update') : await q;
    if (!row) throw notFound('Artículo');
  }
}

async function encode(input: Buffer) {
  const opts = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' as const };
  let format: string | undefined;
  try {
    format = (await sharp(input, opts).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new UnsupportedMediaTypeException({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Formato no admitido: use JPEG, PNG o WebP',
    });
  }
  const render = (max: number, quality: number) =>
    sharp(input, opts)
      .rotate()
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
  try {
    const [full, thumb] = await Promise.all([render(SIZES.full, 82), render(SIZES.thumb, 75)]);
    return { full, thumb };
  } catch {
    throw invalid('No se pudo procesar la imagen (archivo dañado o demasiado grande)');
  }
}

function toDto(r: typeof itemPhotos.$inferSelect): ItemPhoto {
  return {
    id: r.id,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    position: r.position,
    createdAt: r.createdAt.toISOString(),
  };
}
