import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('anaquel: crear con repisas y charolas, verlo en 3D y guardar en una charola', async ({
  page,
  account: _,
}, info) => {
  test.setTimeout(90_000);
  const me = await (await page.request.get('/api/auth/me')).json();
  const base = `/api/orgs/${me.memberships[0].organizationId}`;
  const units = await (await page.request.get(`${base}/units`)).json();
  const unitId = units.find((u: { code: string }) => u.code === 'pza').id;
  const post = async (path: string, data: object) =>
    (await page.request.post(`${base}${path}`, { headers: H, data })).json();
  await post('/locations', { kind: 'warehouse', code: 'TALLER', name: 'Taller' });
  const item = await post('/items', { sku: 'BRK-01', name: 'Balata delantera', unitId });

  // Crear el anaquel desde la interfaz: 4 repisas × 3 charolas.
  await page.goto('/gabinetes');
  await page.getByRole('button', { name: 'Nuevo gabinete o anaquel' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Anaquel' }).check();
  await expect(dialog.getByRole('spinbutton', { name: 'Repisas' })).toHaveValue('4');
  await expect(dialog.getByRole('spinbutton', { name: 'Charolas por repisa' })).toHaveValue('3');
  await dialog.getByRole('textbox', { name: 'Código', exact: true }).fill('ANQ-1');
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Refacciones');
  await dialog.getByRole('button', { name: 'Crear anaquel' }).click();
  await expect(page.getByText('Anaquel creado')).toBeVisible();
  await expect(page).toHaveURL(/\/gabinetes\/[0-9a-f-]{36}$/);
  const detail = page.getByRole('complementary', { name: 'Detalle de la charola' });
  await expect(detail).toContainText('12 charolas');

  // Vista 3D abierta: con flechas se saca la charola B2.
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const view = page.locator('canvas[aria-roledescription="Vista 3D"]');
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(page.getByRole('form', { name: 'Medidas del anaquel' })).toContainText('960 × 1075');
  await view.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(view).toHaveAttribute('data-open', 'B2');
  await expect(detail.getByLabel('Nombre de la charola')).toHaveValue('Charola B2');
  await expect(detail).toContainText('Charola vacía');
  await page.screenshot({ path: info.outputPath('anaquel-3d.png') });

  // La charola es una ubicación: se le da entrada y su ficha enlaza al anaquel.
  const anq = (await (await page.request.get(`${base}/cabinets`)).json())[0];
  const full = await (await page.request.get(`${base}/cabinets/${anq.id}`)).json();
  const b2 = full.compartments.find((c: { id: string }) => c.id === 'B2');
  await post('/movements', {
    kind: 'receipt',
    itemId: item.id,
    locationId: b2.locationId,
    quantity: 8,
  });
  await page.goto(`/ubicaciones/${b2.locationId}`);
  await expect(page.getByText('Balata delantera')).toBeVisible();
  await page.getByRole('link', { name: 'Ver en el anaquel' }).click();
  await expect(page).toHaveURL(/resaltar=/);
  await expect(detail).toContainText('Balata delantera');

  // En la lista aparece con su tipo.
  await page.goto('/gabinetes');
  await expect(
    page.getByRole('table', { name: 'Gabinetes y anaqueles' }).getByRole('row', { name: /ANQ-1/ }),
  ).toContainText('Anaquel');
});
