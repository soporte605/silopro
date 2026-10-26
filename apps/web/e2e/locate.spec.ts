import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('¿dónde está?: por alias encuentra el cajón y lo resalta en el estante 3D', async ({
  page,
  account: _,
}, info) => {
  test.setTimeout(90_000);
  const me = await (await page.request.get('/api/auth/me')).json();
  const base = `/api/orgs/${me.memberships[0].organizationId}`;
  const units = await (await page.request.get(`${base}/units`)).json();
  const unitId = units.find((u: { code: string }) => u.code === 'pza').id;
  const wh = await (
    await page.request.post(`${base}/locations`, {
      headers: H,
      data: { kind: 'warehouse', code: 'ALM-1', name: 'Almacén' },
    })
  ).json();
  const cabinet = async (code: string, columns: number) =>
    (
      await page.request.post(`${base}/cabinets`, {
        headers: H,
        data: { parentId: wh.id, code, name: `Gabinete ${code}`, rows: 1, columns },
      })
    ).json();
  await cabinet('GAB-A', 2);
  const b = await cabinet('GAB-B', 2);
  const item = await (
    await page.request.post(`${base}/items`, {
      headers: H,
      data: { sku: 'ESP32-WROOM', name: 'ESP32 DevKit', unitId, aliases: ['placa wifi'] },
    })
  ).json();
  await page.request.post(`${base}/movements`, {
    headers: H,
    data: {
      kind: 'receipt',
      itemId: item.id,
      locationId: b.compartments[1].locationId,
      quantity: 12,
    },
  });

  await page.goto('/');
  if (info.project.name === 'movil') {
    await page.getByRole('link', { name: '¿Dónde está?' }).click();
  } else {
    // «/» desde cualquier pantalla abre la búsqueda.
    await page.keyboard.press('/');
  }
  await expect(page).toHaveURL(/\/donde/);
  const box = page.getByRole('searchbox', { name: 'Artículo, SKU o alias' });
  await expect(box).toBeFocused();
  await box.fill('placa wi-fi');

  const results = page.getByRole('list', { name: 'Resultados' });
  await expect(results).toContainText('ESP32 DevKit');
  await expect(results).toContainText('le dicen «placa wifi»');
  await expect(results).toContainText('GAB-B · A2');
  await expect(results).toContainText('ALM-1 / GAB-B / A2');
  await expect(page).toHaveURL(/q=placa/);
  await page.screenshot({ path: info.outputPath('donde-esta.png') });

  await results.getByRole('link', { name: 'Ver en 3D' }).click();
  await expect(page).toHaveURL(new RegExp(`/gabinetes/estante/${wh.id}\\?`));
  const view = page.locator('canvas[aria-roledescription="Vista 3D"]');
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(view).toHaveAttribute('data-selected', 'GAB-B/A2');
  await expect(view).toHaveAttribute('data-open', 'GAB-B/A2');
  await expect(page.getByText('1 cajón coincide')).toBeVisible();
  const detail = page.getByRole('complementary', { name: 'Detalle del cajón' });
  await expect(detail).toContainText('ESP32 DevKit');
  await page.screenshot({ path: info.outputPath('donde-esta-3d.png') });

  // Enter en la búsqueda lleva directo al primer cajón; sin coincidencias lo dice.
  await page.goto('/donde?q=esp32');
  await expect(page.getByRole('searchbox')).toHaveValue('esp32');
  await expect(page.getByRole('list', { name: 'Resultados' })).toContainText('GAB-B · A2');
  await page.getByRole('searchbox').press('Enter');
  await expect(view).toHaveAttribute('data-selected', 'GAB-B/A2', { timeout: 30_000 });
  await page.goto('/donde?q=arduino');
  await expect(page.getByText('No encontramos «arduino»')).toBeVisible();
});
