import { expect, test } from './fixtures';

test('flujo de inventario: ubicación, categoría, artículo y movimientos', async ({
  page,
  account: _,
}) => {
  // Ubicación raíz
  await page.goto('/ubicaciones');
  await page.getByRole('button', { name: 'Nueva ubicación' }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Código').fill('TALLER');
  await dialog.getByLabel('Nombre').fill('Taller principal');
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByText('Taller principal')).toBeVisible();

  // Categoría con atributos
  await page.goto('/categorias');
  await page.getByRole('button', { name: 'Nueva categoría' }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Resistencias');
  await dialog.getByRole('button', { name: 'Añadir atributo' }).click();
  await dialog.getByLabel('Etiqueta').fill('Valor');
  await dialog.getByLabel('Tipo').selectOption('number');
  await dialog.getByLabel('Unidad').fill('Ω');
  await dialog.getByLabel('Obligatorio').check();
  await expect(dialog.getByText('clave: valor')).toBeVisible();
  await dialog.getByRole('button', { name: 'Crear categoría' }).click();
  await expect(page.getByRole('cell', { name: 'Resistencias', exact: true })).toBeVisible();

  // Artículo: el atributo obligatorio se valida en la API
  await page.goto('/inventario');
  await expect(page.getByText('Aún no hay artículos')).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo artículo' }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('SKU').fill('R-10K');
  await dialog
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Resistencia 10 kΩ 1/4 W');
  await dialog.getByLabel('Categoría').selectOption({ label: 'Resistencias' });
  await dialog.getByLabel('Existencia mínima').fill('20');
  await dialog.getByRole('button', { name: 'Crear artículo' }).click();
  await expect(dialog.getByRole('alert').first()).toHaveText(/Atributos inválidos/);
  await expect(dialog.getByRole('alert')).toHaveCount(2); // mensaje general + campo «Valor»
  await dialog.getByLabel('Valor (Ω)').fill('10000');
  await dialog.getByRole('button', { name: 'Crear artículo' }).click();

  // Detalle
  await expect(page).toHaveURL(/\/inventario\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Resistencia 10 kΩ 1/4 W' })).toBeVisible();

  // Entrada de 50
  await page.getByRole('button', { name: 'Entrada' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cantidad').fill('50');
  await dialog.getByRole('button', { name: 'Registrar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: 'TALLER' })).toBeVisible();

  // Salida mayor a la existencia: rechazada
  await page.getByRole('button', { name: 'Salida' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cantidad').fill('80');
  await dialog.getByRole('button', { name: 'Registrar' }).click();
  await expect(dialog.getByRole('alert')).toContainText('insuficientes');
  await dialog.getByLabel('Cantidad').fill('35');
  await dialog.getByRole('button', { name: 'Registrar' }).click();
  await expect(dialog).toBeHidden();

  // 15 ≤ mínimo 20 → bajo mínimo
  await expect(page.getByText('Bajo mínimo')).toBeVisible();
  await page.getByRole('tab', { name: 'Movimientos' }).click();
  await expect(page.getByRole('cell', { name: '-35' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '+50' })).toBeVisible();
  await page.getByRole('tab', { name: 'Datos' }).click();
  await expect(page.getByText('10000 Ω')).toBeVisible();

  // Lista con filtro de bajo mínimo y búsqueda
  await page.goto('/inventario');
  await page.getByLabel('Solo bajo mínimo').check();
  await expect(page.getByRole('link', { name: 'R-10K' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar artículos' }).fill('no-existe');
  await expect(page.getByText('Sin resultados')).toBeVisible();
});
