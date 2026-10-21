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

export function decodeQrReference(payload: string): QrReference | null {
  const match = /^silo:([a-z]+)\/([0-9A-Z]+)$/.exec(payload.trim());
  if (!match) return null;
  const parsed = qrReferenceSchema.safeParse({ type: match[1], code: match[2] });
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
