/** Une clases condicionales. Deliberadamente mínimo: sin dependencia de clsx/tailwind-merge. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Anillo de foco común a todos los controles interactivos. */
export const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg';
