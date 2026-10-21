import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('ubicaciones: editar código y capacidad, y archivar', async ({ page, account: _ }) => {
  const me = await (await page.request.get('/api/auth/me')).json();
  const base = `/api/orgs/${me.memberships[0].organizationId}`;
  const post = async (data: Record<string, unknown>) =>
    (await page.request.post(`${base}/locations`, { headers: H, data })).json();
  const w = await post({ kind: 'warehouse', code: 'EST-01', name: 'Taller' });
  await post({ kind: 'bin', code: 'C1', name: 'Caja de tornillos', parentId: w.id });

  await page.goto('/ubicaciones');
  await page.getByRole('button', { name: 'Editar Taller' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Editar ubicación' })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Código', exact: true }).fill('TALLER');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: 'TALLERTaller' })).toBeVisible();

  // La capacidad se fija en la caja y se conserva al reabrir.
  await page.getByRole('button', { name: 'Editar Caja de tornillos' }).click();
  await dialog.getByRole('spinbutton', { name: 'Capacidad' }).fill('3');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Editar Caja de tornillos' }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Capacidad' })).toHaveValue('3');
  await expect(dialog).toContainText('TALLER / C1');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();

  // Archivar la caja vacía.
  await page.getByRole('button', { name: 'Archivar Caja de tornillos' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByText('Ubicación archivada')).toBeVisible();
  await expect(page.getByText('Caja de tornillos')).toBeHidden();
});
