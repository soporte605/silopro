import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('proyectos: lista de materiales con faltantes, reservar lo disponible y consumir', async ({
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
  const motor = await post('/items', { sku: 'MOT-N20', name: 'Motor N20', unitId });
  const rueda = await post('/items', { sku: 'RUEDA-43', name: 'Rueda 43 mm', unitId });
  await post('/movements', { kind: 'receipt', itemId: motor.id, locationId: bin.id, quantity: 3 });
  await post('/movements', { kind: 'receipt', itemId: rueda.id, locationId: bin.id, quantity: 10 });

  // Crear el proyecto desde la lista.
  await page.goto('/proyectos');
  await expect(page.getByText('Sin proyectos')).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Código').fill('ROBOT-01');
  await dialog.getByLabel('Nombre').fill('Robot seguidor');
  await dialog.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByRole('heading', { name: 'Robot seguidor' })).toBeVisible();

  // Agregar materiales: 4 motores (hay 3) y 4 ruedas (hay 10).
  const add = async (search: string, quantity: string) => {
    await page.getByRole('button', { name: 'Agregar material' }).click();
    await dialog.getByLabel('Buscar').fill(search);
    await dialog.getByRole('button', { name: new RegExp(search) }).click();
    await dialog.getByLabel(/Cantidad necesaria/).fill(quantity);
    await dialog.getByRole('button', { name: 'Agregar' }).click();
    await expect(dialog).toBeHidden();
  };
  await add('MOT-N20', '4');
  await add('RUEDA-43', '4');

  const bom = page.getByRole('table', { name: 'Lista de materiales' });
  const motorRow = bom.locator('tr[data-sku="MOT-N20"]');
  const ruedaRow = bom.locator('tr[data-sku="RUEDA-43"]');
  // Necesario, consumido, reservado, disponible, faltante; y dónde está.
  await expect(motorRow).toContainText(/4 pza\s*0\s*0\s*3\s*1/);
  await expect(motorRow).toContainText('ALM / C1 · 3');
  await expect(ruedaRow).toContainText(/4 pza\s*0\s*0\s*10\s*0/);

  // Reservar lo disponible: aparta 3 motores y 4 ruedas; falta 1 motor.
  await page.getByRole('button', { name: 'Reservar lo disponible' }).click();
  await expect(page.getByText('2 reservas creadas; falta 1 material')).toBeVisible();
  await expect(motorRow).toContainText(/4 pza\s*0\s*3\s*0\s*1/);
  await expect(ruedaRow).toContainText('Cubierto');
  await expect(page.getByText('1 de 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reservar lo disponible' })).toBeDisabled();

  // Consumir las ruedas desde el proyecto.
  const res = page.getByRole('table', { name: 'Reservas del proyecto' });
  await res
    .getByRole('row', { name: /RUEDA-43/ })
    .getByRole('button', { name: 'Consumir' })
    .click();
  await dialog.getByRole('button', { name: 'Consumir' }).click();
  await expect(page.getByText('Consumo registrado')).toBeVisible();
  await expect(ruedaRow).toContainText(/4 pza\s*4\s*0/);

  // En la lista de proyectos se ve el faltante.
  await page.goto('/proyectos');
  const row = page.getByRole('row', { name: /Robot seguidor/ });
  await expect(row).toContainText('1 de 2 cubiertos');
  await expect(row).toContainText('Falta 1');
});
