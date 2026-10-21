import { expect, test } from './fixtures';

test('la página de inicio muestra la organización y la hoja de ruta', async ({ page, account }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SiloPro/);
  await expect(page.getByRole('heading', { name: account.organizationName })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Fundamentos/ })).toBeVisible();
});

test('la paleta de comandos navega con el teclado', async ({ page, isMobile, account: _ }) => {
  test.skip(isMobile, 'Atajo de teclado de escritorio');
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('gabinete');
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
