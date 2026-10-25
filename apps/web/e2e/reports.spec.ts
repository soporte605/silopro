import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('reportes: valor del inventario, movimientos del periodo y sin movimiento', async ({
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
  const bin = await post('/locations', { kind: 'bin', code: 'C1', name: 'C1', parentId: wh.id });
  const cat = await post('/categories', { name: 'Motores' });
  const motor = await post('/items', {
    sku: 'MOT-1',
    name: 'Motor paso a paso',
    unitId,
    cost: 250,
    categoryId: cat.id,
  });
  const cinta = await post('/items', { sku: 'CIN-1', name: 'Cinta', unitId });
  await post('/movements', { kind: 'receipt', itemId: motor.id, locationId: bin.id, quantity: 4 });
  await post('/movements', { kind: 'issue', itemId: motor.id, locationId: bin.id, quantity: 1 });
  await post('/movements', { kind: 'receipt', itemId: cinta.id, locationId: bin.id, quantity: 2 });

  await page.goto('/');
  await page.getByRole('link', { name: 'Reportes' }).first().click();
  await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();

  // Valor del inventario.
  await expect(page.getByTestId('valor-total')).toHaveText('$750.00');
  await expect(page.getByText('1 artículo con existencia no tiene costo')).toBeVisible();
  const byCat = page.getByRole('table', { name: 'Valor por categoría' });
  await expect(byCat.getByRole('row', { name: /Motores/ })).toContainText('$750.00');
  const byItem = page.getByRole('table', { name: 'Valor por artículo' });
  await expect(byItem.locator('tr[data-sku="MOT-1"]')).toContainText(/3 pza.*\$250\.00.*\$750\.00/);
  const valuation = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar CSV' }).click();
  expect((await valuation).suggestedFilename()).toBe('valor-del-inventario.csv');

  // Movimientos del periodo (por defecto, los últimos 30 días).
  await page.getByRole('tab', { name: 'Movimientos del periodo' }).click();
  const moves = page.getByRole('table', { name: 'Movimientos por artículo' });
  await expect(moves.locator('tr[data-sku="MOT-1"]')).toContainText(/\+4\s*−1\s*—\s*\+3 pza/);
  await expect(page.getByText('2 artículos')).toBeVisible();
  const movesCsv = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar CSV' }).click();
  expect((await movesCsv).suggestedFilename()).toMatch(/^movimientos-\d{4}-\d\d-\d\d-a-.*\.csv$/);

  // Un periodo sin movimientos.
  await page.getByLabel('Desde').fill('2020-01-01');
  await page.getByLabel('Desde').dispatchEvent('change');
  await expect(page.getByRole('alert')).toHaveText('El periodo puede ser de hasta un año');
  await page.getByLabel('Hasta').fill('2020-01-31');
  await page.getByLabel('Hasta').dispatchEvent('change');
  await expect(page.getByText('No hubo movimientos en este periodo.')).toBeVisible();

  // Todo se movió hoy: nada lleva 30 días quieto.
  await page.getByRole('tab', { name: 'Sin movimiento' }).click();
  await page.getByRole('button', { name: '30 días' }).click();
  await expect(page.getByText('Todo se mueve')).toBeVisible();
});
