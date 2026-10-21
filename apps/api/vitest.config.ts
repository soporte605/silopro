import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emite los metadatos de decoradores que NestJS necesita para la inyección
// de dependencias; el transformador por defecto (esbuild/oxc) no los genera.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['test/setup-db.ts'],
    // Las suites comparten una base de datos; se ejecutan en serie para que
    // las pruebas de concurrencia midan solo su propia carga.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
