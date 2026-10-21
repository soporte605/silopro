/** Límites de fotografías de artículos (compartidos por API y web). */
export const MAX_PHOTOS_PER_ITEM = 10;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
/** Formatos aceptados; se detectan por contenido, no por extensión. */
export const PHOTO_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type PhotoSize = 'thumb' | 'full';

export interface ItemPhoto {
  id: string;
  width: number;
  height: number;
  bytes: number;
  position: number;
  createdAt: string;
}
