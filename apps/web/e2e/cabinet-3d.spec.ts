import { expect, test } from './fixtures';

const H = { 'X-SiloPro-Request': '1' };

test('vista 3D: abre cajones con teclado y clic, y muestra su contenido', async ({
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
  const cab = await (
    await page.request.post(`${base}/cabinets`, {
      headers: H,
      data: { parentId: wh.id, code: 'GAB-3D', name: 'Tornillería', rows: 3, columns: 3 },
    })
  ).json();
  const b2 = cab.compartments.find((c: { id: string }) => c.id === 'B2');
  const item = await (
    await page.request.post(`${base}/items`, {
      headers: H,
      data: { sku: 'M3-10', name: 'Tornillo M3 × 10', unitId },
    })
  ).json();
  expect(
    (
      await page.request.post(`${base}/movements`, {
        headers: H,
        data: { kind: 'receipt', itemId: item.id, locationId: b2.locationId, quantity: 50 },
      })
    ).status(),
  ).toBe(201);

  await page.goto(`/gabinetes/${cab.id}`);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const view = page.locator('canvas[aria-roledescription="Vista 3D"]');
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  const detail = page.getByRole('complementary', { name: 'Detalle del cajón' });

  // El primer cajón queda elegido y abierto.
  await expect(view).toHaveAttribute('data-selected', 'A1');
  await expect(view).toHaveAttribute('data-open', 'A1');

  // Teclado: bajar y a la derecha llega a B2, que tiene el tornillo.
  await view.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(view).toHaveAttribute('data-open', 'B2');
  await expect(detail).toContainText('B2');
  await expect(detail).toContainText('Tornillo M3 × 10');
  await page.keyboard.press('Enter');
  await expect(view).not.toHaveAttribute('data-open', /.+/);
  await page.keyboard.press('Enter');
  await expect(view).toHaveAttribute('data-open', 'B2');
  await page.screenshot({ path: info.outputPath('vista-3d.png') });

  // Puntero: buscar dónde se ve C3 al pasar el ratón y hacer clic ahí.
  if (!info.project.use.hasTouch) {
    const box = (await view.boundingBox())!;
    const tip = page.locator('span.font-mono', { hasText: /^C3$/ });
    let hit: { x: number; y: number } | null = null;
    // C3 queda abajo a la derecha: se recorre desde esa esquina.
    for (let gy = 0.9; gy > 0.1 && !hit; gy -= 0.06) {
      for (let gx = 0.9; gx > 0.1 && !hit; gx -= 0.06) {
        const p = { x: box.x + box.width * gx, y: box.y + box.height * gy };
        await page.mouse.move(p.x, p.y);
        if (await tip.isVisible()) hit = p;
      }
    }
    expect(hit, 'C3 visible en la vista 3D').not.toBeNull();
    await page.mouse.click(hit!.x, hit!.y);
    await expect(view).toHaveAttribute('data-selected', 'C3');
    await expect(view).toHaveAttribute('data-open', 'C3');
    await expect(detail).toContainText('C3');
  }

  // Medidas reales: celdas de 60 mm de ancho.
  const medidas = page.getByRole('form', { name: 'Medidas del gabinete' });
  await medidas.getByRole('spinbutton', { name: 'Ancho de celda (mm)' }).fill('60');
  await expect(medidas).toContainText('Exterior: 188 × 98 × 122 mm');
  await medidas.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(page.getByText('Medidas guardadas')).toBeVisible();
  await expect(view).toHaveAttribute('data-status', 'ready');

  // Desde la ficha del cajón, «Ver en 3D» abre el gabinete con ese cajón afuera.
  await page.goto(`/ubicaciones/${b2.locationId}`);
  await page.getByRole('link', { name: 'Ver en 3D' }).click();
  await expect(page).toHaveURL(/vista=3d/);
  await expect(view).toHaveAttribute('data-open', 'B2', { timeout: 30_000 });
  await expect(page.getByRole('form', { name: 'Medidas del gabinete' })).toContainText('188 × 98');

  // La vista elegida se recuerda; la cuadrícula conserva la selección.
  await page.goto(`/gabinetes/${cab.id}`);
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Cuadrícula' }).click();
  await expect(page.locator('[data-address="A1"]')).toBeVisible();
});
