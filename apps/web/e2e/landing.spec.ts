import { expect, test } from '@playwright/test';

test('sin sesión, la raíz muestra la página comercial con precios', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/producto$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sabe qué tienes y en qué cajón está.' }),
  ).toBeVisible();

  const pro = page.getByRole('listitem', { name: 'Plan Profesional' });
  await expect(pro).toContainText('$699.00');
  await expect(pro).toContainText('Hasta 10 usuarios');
  await page.getByRole('button', { name: 'Anual' }).click();
  await expect(pro).toContainText('$6,990.00 al año');

  await pro.getByRole('link', { name: 'Empezar prueba gratis' }).click();
  await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
  await expect(page.getByText('14 días de prueba gratis')).toBeVisible();
});

test('los avisos legales están enlazados desde el pie', async ({ page }) => {
  await page.goto('/producto');
  const legal = page.getByRole('navigation', { name: 'Legal' });
  await legal.getByRole('link', { name: 'Aviso de privacidad' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Aviso de privacidad' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '7. Sus derechos (ARCO)' })).toBeVisible();

  await legal.getByRole('link', { name: 'Términos y condiciones' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Términos y condiciones' }),
  ).toBeVisible();
  await expect(page.getByText('14 días de prueba sin costo')).toBeVisible();
});
