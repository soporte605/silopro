import { expect, test } from './fixtures';

test('escáner: lee el QR de la cámara y abre la etiqueta; también acepta el enlace pegado', async ({
  page,
  account: _,
}) => {
  // La cámara falsa de Chromium muestra el QR de .playwright/qr-camera.y4m.
  await page.goto('/escanear');
  await expect(page).toHaveURL(/\/q\/u\/QRPRZEBA01$/, { timeout: 20_000 });

  // Sin permiso de cámara se avisa, y se puede pegar el enlace de la etiqueta.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Sin permiso', 'NotAllowedError'));
  });
  await page.goto('/escanear');
  await expect(page.getByRole('status')).toContainText('No hay permiso para usar la cámara');
  await page.getByLabel('O pegue el enlace de la etiqueta').fill('https://otra.cosa/hola');
  await page.getByRole('button', { name: 'Abrir' }).click();
  await expect(page.getByRole('alert')).toContainText('no es de una etiqueta de SiloPro');
  await page.getByLabel('O pegue el enlace de la etiqueta').fill('silo:item/ABCDEFGH12');
  await page.getByRole('button', { name: 'Abrir' }).click();
  await expect(page).toHaveURL(/\/q\/a\/ABCDEFGH12$/);
});
