import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('lista de compras: avisos en inicio, agrupado por proveedor y exportación', async ({
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
  const sup = await post('/suppliers', { name: 'Electrónica Norte' });
  const led = await post('/items', {
    sku: 'LED-R',
    name: 'LED rojo',
    unitId,
    minStock: 20,
    cost: 1.5,
    supplierIds: [sup.id],
  });
  await post('/movements', { kind: 'receipt', itemId: led.id, locationId: bin.id, quantity: 5 });
  const servo = await post('/items', { sku: 'SRV-1', name: 'Servo', unitId });
  const p = await post('/projects', { code: 'BRAZO', name: 'Brazo robótico' });
  await post(`/projects/${p.id}/lines`, { itemId: servo.id, quantity: 4 });

  // Avisos en inicio.
  await page.goto('/');
  const avisos = page.getByRole('region', { name: 'Avisos' });
  await expect(avisos.getByRole('link', { name: /1\s*Artículos con stock bajo/ })).toBeVisible();
  await expect(avisos.getByRole('link', { name: /2\s*Por comprar/ })).toBeVisible();
  await expect(avisos.getByRole('link', { name: /1\s*Proyectos con faltantes/ })).toBeVisible();

  // El aviso de stock bajo abre el inventario filtrado.
  await avisos.getByRole('link', { name: /stock bajo/ }).click();
  await expect(page.getByLabel('Solo bajo mínimo')).toBeChecked();
  await expect(page.getByRole('link', { name: 'LED rojo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Servo' })).toBeHidden();

  // Lista de compras agrupada por proveedor.
  await page.goto('/compras');
  const norte = page.getByRole('table', { name: 'Comprar a Electrónica Norte' });
  await expect(norte.locator('tr[data-sku="LED-R"]')).toContainText(
    /15 pza\s*5\s*20\s*Stock mínimo/,
  );
  await expect(norte).toContainText('$22.50');
  const sin = page.getByRole('table', { name: 'Comprar a Sin proveedor' });
  await expect(sin.locator('tr[data-sku="SRV-1"]')).toContainText('BRAZO · 4');

  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar CSV' }).click();
  expect((await download).suggestedFilename()).toBe('lista-de-compras.csv');
});
