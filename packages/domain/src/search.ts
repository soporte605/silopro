/**
 * Búsqueda tolerante para «¿dónde está?»: sin mayúsculas, acentos, espacios
 * ni signos, de modo que «esp 32», «ESP-32» y «esp32» encuentren lo mismo.
 */

/** Minúsculas, sin acentos y solo letras y dígitos. */
export function compactSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Términos de una búsqueda: cada palabra compactada, sin vacíos ni repetidos.
 * Todos deben aparecer en el texto del artículo (en cualquier orden).
 */
export function searchTerms(query: string): string[] {
  const terms = query.split(/\s+/).map(compactSearchText).filter(Boolean);
  return [...new Set(terms)].slice(0, 8);
}

/** ¿Contiene `text` todos los términos? */
export function matchesSearch(text: string, terms: readonly string[]): boolean {
  const hay = compactSearchText(text);
  return terms.length > 0 && terms.every((t) => hay.includes(t));
}
