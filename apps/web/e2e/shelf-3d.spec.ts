import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('estante en 3D: varios gabinetes juntos, búsqueda y paso entre gabinetes', async ({
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
      data: { kind: 'warehouse', code: 'TALLER', name: 'Taller' },
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
  const b = await cabinet('GAB-B', 1);
  const item = await (
    await page.request.post(`${base}/items`, {
      headers: H,
      data: { sku: 'M3-10', name: 'Tornillo M3 × 10', unitId },
    })
  ).json();
  await page.request.post(`${base}/movements`, {
    headers: H,
    data: {
      kind: 'receipt',
      itemId: item.id,
      locationId: b.compartments[0].locationId,
      quantity: 20,
    },
  });

  await page.goto(`/ubicaciones/${wh.id}`);
  await page.getByRole('link', { name: 'Ver 2 gabinetes en 3D' }).click();
  const view = page.locator('canvas[aria-roledescription="Vista 3D"]');
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(page.getByText('2 gabinetes')).toBeVisible();

  await page.getByRole('searchbox').fill('M3');
  await expect(page.getByText('1 cajón coincide')).toBeVisible();

  // Flechas: GAB-A A1 → A2 → (sale por la derecha) GAB-B A1.
  await view.focus();
  await page.keyboard.press('ArrowRight');
  await expect(view).toHaveAttribute('data-selected', 'GAB-A/A1');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(view).toHaveAttribute('data-open', 'GAB-B/A1');
  const detail = page.getByRole('complementary', { name: 'Detalle del cajón' });
  await expect(detail).toContainText('Tornillo M3 × 10');
  await page.screenshot({ path: info.outputPath('estante-3d.png') });
  await page.keyboard.press('Enter');
  await expect(view).not.toHaveAttribute('data-open', /.+/);

  await detail.getByRole('link', { name: 'Abrir gabinete' }).click();
  await expect(page).toHaveURL(new RegExp(`/gabinetes/${b.id}\\?.*vista=3d`));
  await page.getByRole('link', { name: 'Estante en 3D' }).click();
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
});
