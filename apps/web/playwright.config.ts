import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { writeQrCamera } from './e2e/support/qr-camera';

// En entornos con Chromium preinstalado puede indicarse su ruta con
// PLAYWRIGHT_CHROMIUM_PATH (p. ej. /opt/pw-browsers/chromium).
const executablePath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

// Cámara falsa que muestra un QR, para probar el escáner de la app.
// Fuera de test-results, que Playwright vacía al empezar.
const qrCamera = resolve('.playwright/qr-camera.y4m');
writeQrCamera(qrCamera);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Los flujos largos (registro, invitaciones, inventario) rondan los 30 s en
  // máquinas de 4 núcleos con la suite en paralelo.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'retain-on-failure',
    permissions: ['camera'],
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${qrCamera}`,
      ],
    },
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
  // La API debe estar compilada (`pnpm --filter @silopro/api build`) y usar una base
  // desechable: las pruebas crean cuentas y organizaciones nuevas en cada ejecución.
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL:
          process.env['E2E_DATABASE_URL'] ??
          'postgres://silopro:silopro@localhost:5432/silopro_e2e',
        MIGRATE_ON_START: 'true',
        CORS_ORIGINS: 'http://localhost:4300',
        UPLOADS_DIR: 'test-results/uploads',
        PUBLIC_WEB_URL: 'http://localhost:4300',
      },
    },
    {
      command: 'npx ng serve --port 4300',
      url: 'http://localhost:4300',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});
