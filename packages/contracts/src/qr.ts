import { z } from 'zod';

/**
 * Contenido de las etiquetas QR.
 *
 * El QR codifica solo una referencia opaca y estable, nunca datos del
 * artículo (precio, proveedor, cantidades). La referencia se resuelve en el
 * servidor respetando la autorización del usuario que escanea.
 *
 *   silo:<tipo>/<código-corto>
 *
 * El código corto es aleatorio (base32 Crockford, 10 caracteres) y se guarda
 * en la entidad; no deriva del id interno.
 */
export const QR_ENTITY_TYPES = ['item', 'location'] as const;
export type QrEntityType = (typeof QR_ENTITY_TYPES)[number];

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{10}$/;

export const qrReferenceSchema = z.object({
  type: z.enum(QR_ENTITY_TYPES),
  code: z.string().regex(CROCKFORD),
});

export type QrReference = z.infer<typeof qrReferenceSchema>;

export function encodeQrReference(ref: QrReference): string {
  qrReferenceSchema.parse(ref);
  return `silo:${ref.type}/${ref.code}`;
}

/** Letra de cada tipo en la ruta corta `/q/<letra>/<código>`. */
const URL_LETTER: Record<QrEntityType, string> = { item: 'a', location: 'u' };

/**
 * Enlace que se imprime en la etiqueta. La cámara de un celular lo abre en el
 * navegador y la app lo resuelve con la sesión de quien escanea; sin sesión,
 * pide iniciarla. `base` es la dirección de SiloPro (p. ej. la IP de la PC en
 * la red local), sin barra final.
 */
export function qrUrl(base: string, ref: QrReference): string {
  qrReferenceSchema.parse(ref);
  return `${base.replace(/\/+$/, '')}/q/${URL_LETTER[ref.type]}/${ref.code}`;
}

/** Tipo a partir de la letra de la ruta corta (`a` artículo, `u` ubicación). */
export function qrTypeFromLetter(letter: string): QrEntityType | null {
  const found = Object.entries(URL_LETTER).find(([, l]) => l === letter.toLowerCase());
  return (found?.[0] as QrEntityType | undefined) ?? null;
}

/** Acepta `silo:<tipo>/<código>` o un enlace `…/q/<letra>/<código>`. */
export function decodeQrReference(payload: string): QrReference | null {
  const text = payload.trim();
  const silo = /^silo:([a-z]+)\/([0-9A-Z]+)$/.exec(text);
  const url = /\/q\/([a-z])\/([0-9A-Z]+)\/?$/i.exec(text);
  const type = silo ? silo[1] : url ? qrTypeFromLetter(url[1]!) : null;
  const code = silo?.[2] ?? url?.[2]?.toUpperCase();
  const parsed = qrReferenceSchema.safeParse({ type, code });
  return parsed.success ? parsed.data : null;
}

/** Genera un código corto aleatorio usando una fuente criptográfica. */
export function generateShortCode(random: (n: number) => Uint8Array = defaultRandom): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = random(10);
  let out = '';
  for (const b of bytes) out += alphabet[b & 31];
  return out;
}

function defaultRandom(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Resultado de resolver una etiqueta escaneada dentro de la organización. */
export interface QrTarget {
  type: QrEntityType;
  id: string;
  name: string;
  /** SKU del artículo o ruta de la ubicación. */
  label: string;
  /** Gabinete que abrir: el propio (si la ubicación es un gabinete) o el que contiene el cajón. */
  cabinetId: string | null;
}
