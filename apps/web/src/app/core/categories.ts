import type { Category } from '@silopro/contracts';

/** Opciones de categoría en orden de árbol, con sangría por nivel. */
export function categoryTree(list: Category[]): { id: string; label: string; depth: number }[] {
  const children = new Map<string | null, Category[]>();
  for (const c of list) {
    const key = c.parentId ?? null;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    const kids = (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    for (const c of kids) {
      out.push({ id: c.id, label: `${'  '.repeat(depth)}${c.name}`, depth });
      if (depth < 12) walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Cadena de atributos raíz→hoja para la categoría indicada. */
export function attributeChain(list: Category[], categoryId: string | null) {
  const byId = new Map(list.map((c) => [c.id, c]));
  const chain: Category['attributes'][] = [];
  let cur = categoryId ? byId.get(categoryId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur.attributes);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}
