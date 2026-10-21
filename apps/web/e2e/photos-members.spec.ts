import { expect, newAccount, register, test } from './fixtures';

/** PNG válido de 4×4 px (generado con sharp). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4Y2wMRwzEcQD7ExMhwLzAsQAAAABJRU5ErkJggg==',
  'base64',
);

test('fotografías: subir, ver como portada y eliminar', async ({ page, account: _ }) => {
  const me = await (await page.request.get('/api/auth/me')).json();
  const org = me.memberships[0].organizationId as string;
  const units = await (await page.request.get(`/api/orgs/${org}/units`)).json();
  const item = await (
    await page.request.post(`/api/orgs/${org}/items`, {
      headers: { 'X-SiloPro-Request': '1' },
      data: { sku: 'FOTO-E2E', name: 'Pieza con foto', unitId: units[0].id },
    })
  ).json();

  await page.goto(`/inventario/${item.id}`);
  await page.getByRole('tab', { name: 'Fotografías' }).click();
  await expect(page.getByText('Sin fotografías')).toBeVisible();
  await page
    .getByLabel('Elegir fotografías')
    .setInputFiles([{ name: 'pieza.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.getByText('Fotografía agregada')).toBeVisible();
  const gallery = page.getByRole('list', { name: 'Fotografías' });
  await expect(gallery.locator('img')).toHaveCount(1);
  await expect(gallery.getByText('Portada')).toBeVisible();
  // La imagen se sirve de verdad (no un 404).
  await expect
    .poll(() => gallery.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  // Un archivo que no es imagen se rechaza.
  await page
    .getByLabel('Elegir fotografías')
    .setInputFiles([{ name: 'falso.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<svg/>') }]);
  await expect(page.getByText(/Formato no admitido/)).toBeVisible();

  await page.goto('/inventario');
  await expect(page.getByRole('row', { name: /Pieza con foto/ }).locator('img')).toHaveCount(1);

  await page.goto(`/inventario/${item.id}`);
  await page.getByRole('tab', { name: 'Fotografías' }).click();
  await page.getByRole('button', { name: 'Eliminar fotografía 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Sin fotografías')).toBeVisible();
});

test('invitar a un operador y que acepte con el enlace', async ({ page, browser, account }) => {
  await page.goto('/miembros');
  await expect(page.getByRole('cell', { name: /Ana Pruebas/ })).toBeVisible();
  await page.getByRole('button', { name: 'Invitar' }).click();
  const dialog = page.getByRole('dialog');
  const guest = newAccount('invitado');
  await dialog.getByLabel('Correo electrónico').fill(guest.email);
  await dialog.getByLabel('Rol').selectOption('operator');
  await dialog.getByRole('button', { name: 'Crear enlace' }).click();
  const link = await dialog.getByLabel('Enlace de invitación').inputValue();
  expect(link).toMatch(/\/invitacion\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByRole('cell', { name: guest.email, exact: true })).toBeVisible();
  await expect(page.getByText('Pendiente')).toBeVisible();

  // La persona invitada abre el enlace en otro navegador, sin cuenta.
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto(new URL(link).pathname);
  await expect(
    other.getByText(`te invita a ${account.organizationName}`, { exact: false }),
  ).toBeVisible();
  await other.getByRole('link', { name: `Crear cuenta con ${guest.email}` }).click();
  await expect(other.getByLabel('Correo electrónico')).toHaveValue(guest.email);
  await other.getByLabel('Nombre').fill('Óscar Operador');
  await other.getByLabel('Contraseña').fill(guest.password);
  await other.getByLabel('Organización').fill('Mi propio taller');
  await other.getByRole('button', { name: 'Crear cuenta' }).click();
  await other.getByRole('button', { name: `Unirme a ${account.organizationName}` }).click();
  await expect(other.getByRole('heading', { name: account.organizationName })).toBeVisible();

  // Como operador ve artículos pero no puede crear ni invitar.
  await other.goto('/inventario');
  await expect(other.getByRole('heading', { name: 'Artículos' })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Nuevo artículo' })).toHaveCount(0);
  await other.goto('/miembros');
  await expect(other.getByRole('button', { name: 'Invitar' })).toHaveCount(0);
  await ctx.close();

  await page.reload();
  await expect(page.getByRole('cell', { name: 'Óscar Operador', exact: true })).toBeVisible();
  await expect(page.getByText('Aceptada')).toBeVisible();
});

test('un enlace inválido muestra un aviso claro', async ({ page }) => {
  await register(page);
  await page.goto(`/invitacion/00000000-0000-7000-8000-000000000000/${'x'.repeat(43)}`);
  await expect(page.getByRole('alert')).toContainText('no es válido');
});
