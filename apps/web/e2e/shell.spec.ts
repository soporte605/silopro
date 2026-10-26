import { expect, test } from './fixtures';

test('el inicio muestra la organización, su resumen y los primeros pasos', async ({
  page,
  account,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SiloPro/);
  await expect(page.getByRole('heading', { name: account.organizationName })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toBeVisible();
  const summary = page.getByRole('region', { name: 'Resumen' });
  await expect(summary.getByRole('link', { name: /Artículos/ })).toContainText('0');
  await expect(summary.getByRole('link', { name: /Prueba gratis/ })).toContainText(/\d+ días/);
  await expect(page.getByText('Aún no hay movimientos.')).toBeVisible();
  // Información interna del proyecto, no para clientes.
  await expect(page.getByText('Hoja de ruta')).toHaveCount(0);
  await expect(page.getByText('Estado del sistema')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Design system' })).toHaveCount(0);
});

test('la paleta de comandos navega con el teclado', async ({ page, isMobile, account: _ }) => {
  test.skip(isMobile, 'Atajo de teclado de escritorio');
  await page.goto('/');
  // El atajo se registra cuando la app ya pintó el menú.
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('demostración');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/gabinetes\/demo/);
});

test('el gabinete de demostración permite seleccionar y fusionar', async ({
  page,
  isMobile,
  account: _,
}) => {
  test.skip(isMobile, 'Selección por teclado de escritorio');
  await page.goto('/gabinetes/demo');
  const cabinet = page.getByRole('application');
  await cabinet.focus();
  const detail = page.getByRole('complementary', { name: 'Detalle del compartimento' });
  await expect(detail.getByText('A1', { exact: true })).toBeVisible();
  await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Fusionar selección' }).click();
  await expect(page.getByText('Compartimento A1 creado')).toBeVisible();
  await expect(detail).toContainText('1×2 celdas');
  await expect(detail).toContainText('79 compartimentos');
});

test('el tema oscuro se aplica y persiste', async ({ page, isMobile, account: _ }) => {
  test.skip(isMobile, 'Control en la barra lateral de escritorio');
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /Tema:/ });
  await toggle.click(); // sistema → claro
  await toggle.click(); // claro → oscuro
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('el catálogo abre un diálogo accesible y lo cierra con Escape', async ({
  page,
  account: _,
}) => {
  await page.goto('/sistema/componentes');
  await page.getByRole('button', { name: 'Abrir diálogo' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Transferir existencias' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
