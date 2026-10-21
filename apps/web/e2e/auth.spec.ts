import { expect, newAccount, register, test } from './fixtures';

test('sin sesión redirige al acceso y conserva el destino', async ({ page }) => {
  await page.goto('/inventario');
  await expect(page).toHaveURL(/\/acceso\?volver=%2Finventario/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});

test('registro, cierre de sesión e inicio de sesión', async ({ page }) => {
  const acc = newAccount('ui');
  await page.goto('/registro');
  await page.getByLabel('Nombre').fill(acc.name);
  await page.getByLabel('Correo electrónico').fill(acc.email);
  await page.getByLabel('Contraseña').fill('corta');
  await page.getByLabel('Organización').fill(acc.organizationName);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText(/al menos 10|Mínimo 10/)).toBeVisible();

  await page.getByLabel('Contraseña').fill(acc.password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: acc.organizationName })).toBeVisible();

  await page
    .getByRole('button', { name: 'Cuenta y organización' })
    .filter({ visible: true })
    .click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/acceso/);

  await page.getByLabel('Correo electrónico').fill(acc.email);
  await page.getByLabel('Contraseña').fill('incorrecta-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText(/incorrectos/);

  await page.getByLabel('Contraseña').fill(acc.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: acc.organizationName })).toBeVisible();
});

test('una organización no ve los artículos de otra', async ({ browser }) => {
  const a = await browser.newPage();
  await register(a);
  const created = await a.request.get('/api/auth/me');
  const orgA = (await created.json()).memberships[0].organizationId as string;
  const item = await a.request.post(`/api/orgs/${orgA}/items`, {
    headers: { 'X-SiloPro-Request': '1' },
    data: {
      sku: 'SECRETO-1',
      name: 'Artículo privado',
      unitId: (await (await a.request.get(`/api/orgs/${orgA}/units`)).json())[0].id,
    },
  });
  expect(item.status()).toBe(201);
  const itemId = (await item.json()).id as string;

  const b = await browser.newPage();
  await register(b);
  await b.goto(`/inventario/${itemId}`);
  await expect(b.getByText('Artículo no encontrado')).toBeVisible();
  const direct = await b.request.get(`/api/orgs/${orgA}/items/${itemId}`);
  expect(direct.status()).toBe(404);
  await a.close();
  await b.close();
});
