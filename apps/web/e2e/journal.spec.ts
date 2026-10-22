import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('movimientos y auditoría: filtrar, exportar CSV y ver quién hizo qué', async ({
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
  const item = await post('/items', { sku: 'FUS-5A', name: 'Fusible 5 A', unitId });
  await post('/movements', { kind: 'receipt', itemId: item.id, locationId: bin.id, quantity: 20 });
  await post('/movements', { kind: 'issue', itemId: item.id, locationId: bin.id, quantity: 3 });

  await page.goto('/movimientos');
  const table = page.getByRole('table', { name: 'Movimientos' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row').nth(1)).toContainText('Salida');
  await page.getByLabel('Tipo').selectOption({ label: 'Entradas' });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('+20');

  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar CSV' }).click();
  const file = await download;
  const csv = await (await file.createReadStream()).toArray();
  const text = Buffer.concat(csv).toString('utf8');
  expect(text).toContain('Entrada,FUS-5A,Fusible 5 A,ALM / C1,20');
  expect(text).not.toContain('Salida');

  await page.goto('/auditoria');
  const audit = page.getByRole('table', { name: 'Auditoría' });
  await expect(audit).toContainText('Creó un artículo');
  await expect(audit).toContainText('FUS-5A · Fusible 5 A');
  await expect(audit).toContainText('Registró un movimiento');
});
