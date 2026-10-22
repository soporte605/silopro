import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('reservas: apartar desde el artículo, consumir en parte y liberar el resto', async ({
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
  const bin = await post('/locations', {
    kind: 'bin',
    code: 'CAJA-R',
    name: 'Caja R',
    parentId: wh.id,
  });
  const item = await post('/items', { sku: 'SRV-SG90', name: 'Servo SG90', unitId });
  await post('/movements', { kind: 'receipt', itemId: item.id, locationId: bin.id, quantity: 10 });

  // Desde el artículo: apartar 6 para el robot.
  await page.goto(`/inventario/${item.id}`);
  await page.getByRole('button', { name: 'Reservar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Para qué').fill('Proyecto robot');
  await dialog.getByLabel('Cantidad').fill('6');
  await dialog.getByRole('button', { name: 'Reservar' }).click();
  await expect(page.getByText('Reserva creada')).toBeVisible();
  const stock = page.getByRole('table', { name: 'Existencias por ubicación' });
  // En mano 10, reservado 6, disponible 4.
  await expect(stock.getByRole('row', { name: /ALM \/ CAJA-R/ })).toContainText(/10\s*6\s*4/);

  // En Reservas: consumir 2.
  await page.goto('/reservas');
  const table = page.getByRole('table', { name: 'Reservas' });
  const row = table.getByRole('row', { name: /Proyecto robot/ });
  await expect(row).toContainText('6 de 6');
  await row.getByRole('button', { name: 'Consumir' }).click();
  await dialog.getByLabel('Cantidad usada').fill('2');
  await dialog.getByRole('button', { name: 'Consumir' }).click();
  await expect(page.getByText('Consumo registrado')).toBeVisible();
  await expect(row).toContainText('4 de 6');

  // Liberar el resto: deja de verse entre las activas.
  await row.getByRole('button', { name: 'Liberar' }).click();
  await dialog.getByRole('button', { name: 'Liberar' }).click();
  await expect(page.getByText('Reserva liberada')).toBeVisible();
  await expect(page.getByText('Sin reservas activas')).toBeVisible();
  await page.getByRole('button', { name: 'Todas' }).click();
  await expect(table.getByRole('row', { name: /Proyecto robot/ })).toContainText('2 de 6 usados');
  await expect(table).toContainText('Liberada');

  // El artículo queda con 8 en mano y nada reservado.
  await page.goto(`/inventario/${item.id}`);
  await expect(stock.getByRole('row', { name: /ALM \/ CAJA-R/ })).toContainText(/8\s*0\s*8/);
});
