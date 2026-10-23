import { join } from 'node:path';
import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('importar artículos: revisa errores antes y luego importa un Excel', async ({
  page,
  account: _,
}) => {
  const me = await (await page.request.get('/api/auth/me')).json();
  const base = `/api/orgs/${me.memberships[0].organizationId}`;
  const post = async (path: string, data: object) =>
    (await page.request.post(`${base}${path}`, { headers: H, data })).json();
  const wh = await post('/locations', { kind: 'warehouse', code: 'ALM', name: 'Almacén' });
  await post('/locations', { kind: 'bin', code: 'C1', name: 'C1', parentId: wh.id });

  await page.goto('/inventario');
  await page.getByRole('link', { name: 'Importar' }).click();
  await expect(page.getByRole('heading', { name: 'Importar artículos' })).toBeVisible();

  // Un CSV con punto y coma y una fila sin unidad: la revisión lo marca y no deja importar.
  await page.getByLabel('Elegir archivo').setInputFiles({
    name: 'articulos.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFFSKU;Nombre;Unidad\nCSV-1;Cable dupont;pza\nCSV-2;Sin unidad;\n'),
  });
  await expect(page.getByText('articulos.csv · 2 filas')).toBeVisible();
  await expect(page.getByLabel('Columna Unidad')).toHaveValue('unit');
  await page.getByRole('button', { name: 'Revisar' }).click();
  const rows = page.getByRole('table', { name: 'Filas del archivo' });
  await expect(rows.locator('tr[data-row="2"]')).toContainText('Falta la unidad');
  await expect(page.getByText('1 con errores')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Importar \d+ artículos$/ })).toHaveCount(0);

  // Un Excel válido: columnas reconocidas, revisión y luego importación.
  await page
    .getByLabel('Elegir archivo')
    .setInputFiles(join(__dirname, 'fixtures', 'articulos.xlsx'));
  await expect(page.getByText('articulos.xlsx · 2 filas')).toBeVisible();
  await expect(page.getByLabel('Columna Marca')).toHaveValue('manufacturer');
  await expect(page.getByLabel('Columna Ubicación')).toHaveValue('location');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByText('2 nuevos')).toBeVisible();
  await expect(page.getByText('2 entradas de existencias')).toBeVisible();
  await expect(rows.locator('tr[data-row="1"]')).toContainText('Entrada de 10 en ALM / C1');
  await page.getByRole('button', { name: 'Importar 2 artículos' }).click();
  await expect(page.getByText('Importación lista: 2 nuevos, 0 actualizados')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Importación terminada' })).toBeVisible();

  await page.getByRole('link', { name: 'Ver artículos' }).click();
  const esp = page.getByRole('row', { name: /Módulo ESP32/ });
  await expect(esp).toContainText('10');
  await expect(page.getByRole('row', { name: /Sensor ultrasónico/ })).toContainText('4');
});
