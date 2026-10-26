import { expect, test } from './fixtures';

test('plan y facturación: prueba gratis, uso y planes', async ({ page, account: _ }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Cuenta y organización' })
    .filter({ visible: true })
    .click();
  await page.getByRole('menuitem', { name: 'Plan y facturación' }).click();
  await expect(page.getByRole('heading', { name: 'Plan Prueba gratis' })).toBeVisible();
  await expect(page.getByText('14 días de prueba')).toBeVisible();
  await expect(page.getByText('1 de 10')).toBeVisible();
  await expect(page.getByText('0 de 10,000')).toBeVisible();

  const basic = page.getByRole('listitem', { name: 'Plan Básico' });
  await expect(basic).toContainText('$299.00');
  await expect(basic).toContainText('Hasta 3 usuarios');
  await page.getByRole('button', { name: 'Anual' }).click();
  await expect(basic).toContainText('$2,990.00 al año');
  // Sin Stripe configurado se contrata por correo.
  await expect(basic.getByRole('link', { name: 'Escríbanos para contratar' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Plan Empresa' })).toContainText('A la medida');
});
