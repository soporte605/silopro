import type Anthropic from '@anthropic-ai/sdk';
import type { LocateHit } from '@silopro/contracts';
import type { OrgContext } from '../auth/request-context.js';
import type { ProjectsService } from '../projects/projects.service.js';
import type { ShoppingService } from '../projects/shopping.service.js';
import type { LocateService } from '../stock/locate.service.js';
import type { MovementsService } from '../stock/movements.service.js';

/**
 * Herramientas de solo lectura del asistente. Todas pasan por los servicios
 * de la API con el contexto del usuario, así que respetan su organización
 * (RLS) y su rol: la IA nunca ve la base de datos directamente.
 */
export const ASSISTANT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'localizar',
    description:
      'Busca artículos por nombre, SKU, fabricante, modelo o alias y dice en qué cajones o ubicaciones hay existencias y cuántas. Úsala para «¿dónde está…?», «¿cuántos hay…?» o «¿tengo…?». Prueba variantes (singular, sin marca, otra palabra) si no encuentra nada.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Lo que se busca, p. ej. "esp32" o "tornillo m3".' },
      },
      required: ['texto'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'que_comprar',
    description:
      'Lista de compras: artículos con existencias en o por debajo de su mínimo y faltantes de proyectos abiertos, con cuánto comprar, proveedor y costo estimado.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'proyectos',
    description:
      'Proyectos (listas de materiales) con su estado y cuántas líneas tienen faltantes. Con `codigo`, el detalle de un proyecto: cada material, lo requerido, apartado, consumido y lo que falta.',
    input_schema: {
      type: 'object',
      properties: {
        codigo: {
          type: ['string', 'null'],
          description: 'Código del proyecto para ver su detalle; null para la lista.',
        },
      },
      required: ['codigo'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'movimientos',
    description:
      'Movimientos recientes de existencias (entradas, salidas, ajustes, transferencias, consumos) con quién y cuándo. Con `articulo`, solo los del primer artículo que coincida.',
    input_schema: {
      type: 'object',
      properties: {
        articulo: {
          type: ['string', 'null'],
          description: 'Nombre o SKU del artículo; null para todos.',
        },
      },
      required: ['articulo'],
      additionalProperties: false,
    },
    strict: true,
  },
];

export interface ToolDeps {
  locate: LocateService;
  shopping: ShoppingService;
  projects: ProjectsService;
  movements: MovementsService;
}

/** Resultado de una herramienta: texto para el modelo y artículos localizados para la pantalla. */
export interface ToolOutcome {
  content: string;
  hits?: LocateHit[];
  isError?: boolean;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export async function runAssistantTool(
  deps: ToolDeps,
  ctx: OrgContext,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  switch (name) {
    case 'localizar': {
      const texto = str(input['texto']);
      if (!texto) return { content: 'Falta el texto a buscar.', isError: true };
      const { hits } = await deps.locate.locate(ctx, { q: texto.slice(0, 100), limit: 10 });
      return {
        hits,
        content: JSON.stringify(
          hits.map((h) => ({
            articulo: h.name,
            sku: h.sku,
            fabricante: h.manufacturer,
            modelo: h.model,
            alias: h.matchedAlias,
            total: `${h.onHand} ${h.unitSymbol}`,
            ubicaciones: h.places.map((p) => ({
              ruta: p.path,
              gabinete: p.cabinetCode,
              cajon: p.cabinetCode ? p.code : null,
              cantidad: p.onHand,
            })),
          })),
        ),
      };
    }
    case 'que_comprar': {
      const list = await deps.shopping.list(ctx);
      return {
        content: JSON.stringify({
          total_estimado_mxn: list.estimatedTotal,
          lineas_sin_costo: list.missingCost,
          lineas: list.lines.slice(0, 40).map((l) => ({
            articulo: l.itemName,
            sku: l.sku,
            disponible: l.available,
            minimo: l.minStock,
            pendiente_proyectos: l.projectPending,
            comprar: `${l.toBuy} ${l.unitSymbol}`,
            costo_unitario: l.unitCost,
            proveedor: l.supplierName,
          })),
        }),
      };
    }
    case 'proyectos': {
      const all = await deps.projects.list(ctx, {});
      const codigo = str(input['codigo']);
      if (!codigo) {
        return {
          content: JSON.stringify(
            all.slice(0, 40).map((p) => ({
              codigo: p.code,
              nombre: p.name,
              estado: p.status,
              entrega: p.dueDate,
              lineas: p.lineCount,
              lineas_con_faltante: p.shortageCount,
              lineas_cubiertas: p.coveredCount,
            })),
          ),
        };
      }
      const found = all.find((p) => p.code.toLowerCase() === codigo.toLowerCase());
      if (!found) return { content: `No hay un proyecto con código «${codigo}».`, isError: true };
      const d = await deps.projects.get(ctx, found.id);
      return {
        content: JSON.stringify({
          codigo: d.code,
          nombre: d.name,
          estado: d.status,
          entrega: d.dueDate,
          materiales: d.lines.map((l) => ({
            articulo: l.itemName,
            sku: l.sku,
            requerido: l.required,
            apartado: l.reserved,
            consumido: l.consumed,
            pendiente: l.pending,
            disponible_en_almacen: l.available,
            faltante: l.shortage,
            unidad: l.unitSymbol,
          })),
        }),
      };
    }
    case 'movimientos': {
      const articulo = str(input['articulo']);
      let itemId: string | undefined;
      if (articulo) {
        const { hits } = await deps.locate.locate(ctx, { q: articulo.slice(0, 100), limit: 1 });
        itemId = hits[0]?.itemId;
        if (!itemId) return { content: `No encontré el artículo «${articulo}».`, isError: true };
      }
      const page = await deps.movements.journal(ctx, { itemId, limit: 20 });
      return {
        content: JSON.stringify(
          page.movements.map((m) => ({
            fecha: m.occurredAt,
            tipo: m.kind,
            articulo: m.itemName,
            sku: m.sku,
            ubicacion: m.locationPath,
            cambio: `${m.delta} ${m.unitSymbol}`,
            motivo: m.reason,
            quien: m.actorName,
          })),
        ),
      };
    }
    default:
      return { content: `Herramienta desconocida: ${name}`, isError: true };
  }
}
