import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';

/** La API de e2e guarda los correos en esta carpeta (MAIL_OUTBOX_DIR). */
const OUTBOX = join(__dirname, '..', '.playwright', 'correos');

/** Enlace del último correo enviado a `to` con ese asunto. */
async function mailLink(to: string, subject: string): Promise<string> {
  let link = '';
  await expect
    .poll(() => {
      let files: string[];
      try {
        files = readdirSync(OUTBOX).sort().reverse();
      } catch {
        return '';
      }
      for (const f of files) {
        const m = JSON.parse(readFileSync(join(OUTBOX, f), 'utf8'));
        if (m.to === to && m.subject === subject) {
          link = /https?:\/\/\S+token=[A-Za-z0-9_-]{43}/.exec(m.text)?.[0] ?? '';
          return link;
        }
      }
      return '';
    })
    .not.toBe('');
  return new URL(link).pathname + new URL(link).search;
}

test('confirma el correo con el enlace del aviso', async ({ page, account }) => {
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Confirmar correo' });
  await expect(banner).toContainText(account.email);
  await page.goto(await mailLink(account.email, 'Confirme su correo en SiloPro'));
  await expect(page.getByText('Tu correo quedó confirmado')).toBeVisible();
  await page.getByRole('link', { name: 'Ir a SiloPro' }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(banner).toBeHidden();
});

test('recupera la contraseña desde el inicio de sesión', async ({ page, account }) => {
  await page.context().clearCookies();
  await page.goto('/acceso');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await page.getByLabel('Correo electrónico').fill(account.email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByText('en unos minutos llegará un correo')).toBeVisible({
    timeout: 20_000,
  });

  await page.goto(await mailLink(account.email, 'Restablecer su contraseña de SiloPro'));
  await page.getByLabel('Contraseña nueva').fill('nueva-clave-segura-9');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText('tu contraseña cambió')).toBeVisible();
  await page.getByRole('link', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Correo electrónico').fill(account.email);
  await page.getByLabel('Contraseña').fill('nueva-clave-segura-9');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');
  // El enlace de recuperación también confirma el correo.
  await expect(page.getByRole('region', { name: 'Confirmar correo' })).toBeHidden();
});
