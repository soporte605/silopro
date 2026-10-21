import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emite los metadatos de decoradores que NestJS necesita para la inyección
// de dependencias; el transformador por defecto (esbuild/oxc) no los genera.
export default defineConfig({
  test: { include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'] },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
