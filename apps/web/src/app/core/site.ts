/**
 * Dominios públicos: la página comercial vive en silopro.elikarsystems.com y la
 * app en app.silopro.elikarsystems.com (mismo contenedor web detrás de nginx).
 * En la red local o en desarrollo todo se sirve desde un solo origen.
 */
export const LANDING_ORIGIN = 'https://silopro.elikarsystems.com';
export const APP_ORIGIN = 'https://app.silopro.elikarsystems.com';

const LANDING_HOSTS = new Set(['silopro.elikarsystems.com', 'www.silopro.elikarsystems.com']);

export type SiteKind = 'landing' | 'app' | 'local';

export function siteKind(host: string = location.hostname): SiteKind {
  if (LANDING_HOSTS.has(host)) return 'landing';
  return host === new URL(APP_ORIGIN).hostname ? 'app' : 'local';
}

/** Dirección de la página comercial vista desde el sitio actual. */
export function landingUrl(kind: SiteKind = siteKind()): string {
  return kind === 'app' ? LANDING_ORIGIN : '/producto';
}
