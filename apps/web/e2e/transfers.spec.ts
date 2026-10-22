import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('transferencias: mover desde el artículo y desde la ficha de la ubicación', async ({
  page,
  account: _,
}) => {
  const me = await (await page.request.get('/api/auth/me')).json();
  const base = `/api/orgs/${me.memberships[0].organizationId}`;
  const units = await (await page.request.get(`${base}/units`)).json();
  const unitId = units.find((u: { code: string }) => u.code === 'pza').id;
  const post = async (path: string, data: object) =>
    (await page.request.post(`${base}${path}`, { headers: H, data })).json();
  const wh = await post('/locations', { kind: 'warehouse', code: 'ALM', name: 'Almacén' });
  const a = await post('/locations', {
    kind: 'bin',
    code: 'CAJA-A',
    name: 'Caja A',
    parentId: wh.id,
  });
  const b = await post('/locations', {
    kind: 'bin',
    code: 'CAJA-B',
    name: 'Caja B',
    parentId: wh.id,
  });
  const item = await post('/items', { sku: 'LED-5MM', name: 'LED rojo 5 mm', unitId });
  await post('/movements', { kind: 'receipt', itemId: item.id, locationId: a.id, quantity: 10 });

  // Desde el artículo: 4 de A a B.
  await page.goto(`/inventario/${item.id}`);
  await page.getByRole('button', { name: 'Mover' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Desde')).toHaveValue(a.id);
  await dialog.getByLabel('Hacia').selectOption({ label: 'ALM / CAJA-B' });
  await dialog.getByLabel('Cantidad').fill('4');
  await dialog.getByLabel('Nota').fill('Reordenar');
  await dialog.getByRole('button', { name: 'Mover' }).click();
  await expect(page.getByText('Existencias movidas')).toBeVisible();
  const stock = page.getByRole('table', { name: 'Existencias por ubicación' });
  await expect(stock.getByRole('row', { name: /ALM \/ CAJA-A/ })).toContainText('6');
  await expect(stock.getByRole('row', { name: /ALM \/ CAJA-B/ })).toContainText('4');

  // Desde la ficha de B: «Todo» de vuelta a A.
  await page.goto(`/ubicaciones/${b.id}`);
  await page.getByRole('button', { name: 'Mover LED rojo 5 mm a otra ubicación' }).click();
  await expect(dialog.getByLabel('Desde')).toHaveValue(b.id);
  await dialog.getByLabel('Hacia').selectOption({ label: 'ALM / CAJA-A' });
  await dialog.getByRole('button', { name: 'Todo' }).click();
  await expect(dialog.getByLabel('Cantidad')).toHaveValue('4');
  await dialog.getByRole('button', { name: 'Mover' }).click();
  await expect(page.getByText('Vacío')).toBeVisible();

  // El historial muestra las dos.
  await page.goto('/transferencias');
  const rows = page.getByRole('table', { name: 'Transferencias recientes' }).getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('ALM / CAJA-B → ALM / CAJA-A');
  await expect(rows.nth(2)).toContainText('Reordenar');
});
