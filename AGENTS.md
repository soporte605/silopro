# Instrucciones para agentes de IA

Contexto para asistentes que trabajen en este repositorio (Claude, Codex, Copilot, etc.).

## Proyecto

SiloPro: inventario universal con ubicaciones físicas (almacén → … → cajón → compartimento), vistas 2D/3D y, a futuro, generación CAD para impresión 3D. Producto de ElikarSystems. Fase actual en `docs/ROADMAP.md`.

## Reglas

- Responder y documentar **en español**. Código e identificadores en inglés.
- Commits: Conventional Commits en español (`feat(ámbito): descripción`).
- Antes de terminar: `pnpm check` (formato, lint, tipos, pruebas, build). No afirmar que algo funciona sin ejecutarlo.
- No publicar en remotos, desplegar, contratar servicios, comprar dominios, registrar marcas, borrar datos ni cambiar infraestructura **sin autorización explícita** del propietario.
- No copiar código, diseño ni activos de BOM-Trace u otros productos; son referencia funcional.
- Colores de marca: los valores actuales son **provisionales**; no presentarlos como oficiales.
- Reglas de negocio en `packages/domain`; representación separada del dominio (`cabinet-engine` no conoce SVG ni Three.js).
- No usar React. UI con Angular + Tailwind v4 + Angular CDK y `@elikarsystems/ui`.
- Mantener `CHANGELOG.md` y la documentación alineados con el comportamiento real.

## Mapa rápido

| Necesito…                  | Ir a                                                        |
| -------------------------- | ----------------------------------------------------------- |
| Regla de stock/ubicaciones | `packages/domain/src/`                                      |
| Geometría de gabinetes     | `packages/cabinet-engine/src/`                              |
| Esquema de API compartido  | `packages/contracts/src/`                                   |
| Componente visual          | `packages/ui/src/lib/` (catálogo en `/sistema/componentes`) |
| Colores/tipografía         | `packages/tokens/tokens.css`                                |
| Módulo de API              | `apps/api/src/<módulo>/`                                    |
| Pantalla                   | `apps/web/src/app/pages/`                                   |
| Logotipos                  | `brand/scripts/generate.py` → `brand/concepts/`             |
