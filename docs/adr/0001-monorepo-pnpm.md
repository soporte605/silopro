# 0001 · Monorepo con pnpm workspaces, sin Nx

**Contexto.** Web, API y paquetes de dominio deben evolucionar juntos y compartir tipos. Se evaluaron Nx, Turborepo y pnpm workspaces.

**Decisión.** pnpm workspaces con scripts recursivos (`pnpm -r`, `--filter`). Angular CLI y Nest se usan con sus herramientas nativas.

**Motivos.** El repositorio tiene 2 apps y 5 paquetes: la caché distribuida y los generadores de Nx no compensan su capa adicional de configuración ni el acoplamiento de versiones con Angular. pnpm aporta aislamiento estricto de dependencias (evita dependencias fantasma) y `allowBuilds` para controlar scripts de instalación.

**Consecuencias.** Sin grafo de «afectados» en CI: se ejecuta todo (localmente < 2 min). Revaluar Nx o Turborepo si el tiempo de CI supera ~10 min o se suman más aplicaciones (Tauri, móvil).
