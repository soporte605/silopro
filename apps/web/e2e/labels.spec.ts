import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('etiquetas: hoja de un gabinete y escaneo que abre el cajón', async ({ page, account: _ }) => {
  const me = await (await page.request.get('/api/auth/me')).json();
  const base = `/api/orgs/${me.memberships[0].organizationId}`;
  const w = await (
    await page.request.post(`${base}/locations`, {
      headers: H,
      data: { kind: 'warehouse', code: 'TALLER', name: 'Taller' },
    })
  ).json();
  const cab = await (
    await page.request.post(`${base}/cabinets`, {
      headers: H,
      data: { parentId: w.id, code: 'GAB-1', name: 'Electrónica', rows: 2, columns: 3 },
    })
  ).json();

  // Desde el gabinete, «Imprimir etiquetas» abre la hoja con el gabinete y sus 6 cajones.
  await page.goto(`/gabinetes/${cab.id}`);
  await page.getByRole('link', { name: 'Imprimir etiquetas' }).click();
  await expect(page).toHaveURL(/\/etiquetas\?gabinete=/);
  const preview = page.getByRole('region', { name: 'Vista previa' });
  await expect(preview.locator('.sp-label')).toHaveCount(7);
  await expect(preview.locator('[data-label="B3"] svg[role="img"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimir 7' })).toBeEnabled();

  // Quitar una y empezar en la tercera posición de una hoja usada.
  await page.getByRole('checkbox', { name: /^A1/ }).uncheck();
  await expect(page.getByRole('button', { name: 'Imprimir 6' })).toBeVisible();
  await page.getByLabel('Empezar en la etiqueta').fill('3');
  await expect(preview.locator('.sp-label').first()).toHaveAttribute('data-label', 'GAB-1');

  // El QR lleva la dirección configurada.
  await page.getByLabel('Dirección en el QR').fill('http://192.168.1.50:8080');
  await page.getByLabel('Dirección en el QR').blur();
  await expect(page.getByLabel('Dirección en el QR')).toHaveValue('http://192.168.1.50:8080');

  // Al imprimir solo sale la hoja.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sp-print-root .sp-label')).toHaveCount(6);
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  // Escanear la etiqueta de B2 abre el gabinete con ese cajón seleccionado.
  const b2 = cab.compartments.find((c: { id: string }) => c.id === 'B2');
  await page.goto(`/q/u/${b2.qrCode}`);
  await expect(page).toHaveURL(new RegExp(`/gabinetes/${cab.id}\\?resaltar=${b2.locationId}`));
  const detail = page.getByRole('complementary', { name: 'Detalle del cajón' });
  await expect(detail.getByText('B2', { exact: true })).toBeVisible();

  // Un código inexistente avisa claramente.
  await page.goto('/q/a/0123456789');
  await expect(page.getByText('Etiqueta no encontrada')).toBeVisible();
});
