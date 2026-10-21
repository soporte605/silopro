import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('gabinete: crear, fusionar, guardar y encontrar un artículo en su cajón', async ({
  page,
  account: _,
}) => {
  // Datos base por API: almacén y artículo.
  const me = await (await page.request.get('/api/auth/me')).json();
  const base = `/api/orgs/${me.memberships[0].organizationId}`;
  const units = await (await page.request.get(`${base}/units`)).json();
  const unitId = units.find((u: { code: string }) => u.code === 'pza').id;
  expect(
    (
      await page.request.post(`${base}/locations`, {
        headers: H,
        data: { kind: 'warehouse', code: 'TALLER', name: 'Taller' },
      })
    ).status(),
  ).toBe(201);
  const item = await (
    await page.request.post(`${base}/items`, {
      headers: H,
      data: { sku: 'ESP32-DK', name: 'ESP32 DevKit', unitId },
    })
  ).json();

  // Crear el gabinete desde la interfaz.
  await page.goto('/gabinetes');
  await expect(page.getByText('Sin gabinetes')).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo gabinete' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Código', exact: true }).fill('GAB-1');
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Electrónica');
  await dialog.getByRole('spinbutton', { name: 'Filas' }).fill('3');
  await dialog.getByRole('spinbutton', { name: 'Columnas' }).fill('4');
  await dialog.getByRole('button', { name: 'Crear gabinete' }).click();
  await expect(page).toHaveURL(/\/gabinetes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Electrónica' })).toBeVisible();
  const detail = page.getByRole('complementary', { name: 'Detalle del cajón' });
  await expect(detail).toContainText('12 cajones');

  // Fusionar A1 + A2 y guardar.
  await page.locator('[data-address="A1"]').click();
  await page.locator('[data-address="A2"]').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Fusionar selección' }).click();
  await expect(page.getByText('Cambios sin guardar')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar diseño' }).click();
  await expect(page.getByText('Diseño guardado')).toBeVisible();
  await expect(detail).toContainText('11 cajones');
  await expect(detail).toContainText('1×2 celdas');

  // Renombrar el cajón fusionado.
  await detail.getByLabel('Nombre del cajón').fill('Microcontroladores');
  await detail.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Nombre guardado')).toBeVisible();

  // Entrada al cajón B2 desde el artículo y enlace de vuelta al gabinete.
  await page.goto(`/inventario/${item.id}`);
  await page.getByRole('button', { name: 'Entrada' }).click();
  const mov = page.getByRole('dialog');
  await mov.getByLabel('Ubicación').selectOption({ label: 'TALLER / GAB-1 / B2' });
  await mov.getByLabel('Cantidad').fill('4');
  await mov.getByRole('button', { name: 'Registrar' }).click();
  await expect(mov).toBeHidden();
  await page.getByRole('link', { name: 'TALLER / GAB-1 / B2: ver en el gabinete' }).click();
  await expect(page).toHaveURL(/resaltar=/);
  await expect(detail.getByText('B2', { exact: true })).toBeVisible();
  await expect(detail.getByRole('link', { name: /ESP32 DevKit/ })).toBeVisible();

  // La búsqueda resalta el cajón donde está el artículo.
  await page.getByRole('searchbox', { name: 'Buscar artículo, SKU o cajón' }).fill('esp32');
  await expect(detail).toContainText('1 coincidencias');
});
