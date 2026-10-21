import { defineConfig, devices } from '@playwright/test';

// En entornos con Chromium preinstalado puede indicarse su ruta con
// PLAYWRIGHT_CHROMIUM_PATH (p. ej. /opt/pw-browsers/chromium).
const executablePath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx ng serve --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
