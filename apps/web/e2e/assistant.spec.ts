import type { AssistantReply, AssistantStatus } from '@silopro/contracts';
import { expect, test } from './fixtures';

test('asistente sin clave de IA: lo explica y lleva a «¿Dónde está?»', async ({
  page,
  account: _,
}) => {
  await page.goto('/asistente');
  await expect(page.getByText('El asistente no está activado')).toBeVisible();
  await page.getByRole('link', { name: 'Ir a ¿Dónde está?' }).click();
  await expect(page).toHaveURL(/\/donde/);
});

test('asistente: pregunta, responde con el cajón y abre el estante en 3D', async ({
  page,
  account: _,
}) => {
  // La IA se simula: la prueba no depende de la API de Claude.
  const sent: unknown[] = [];
  await page.route('**/assistant', (route) =>
    route.fulfill({
      json: { enabled: true, quota: { used: 3, limit: 50 } } satisfies AssistantStatus,
    }),
  );
  await page.route('**/assistant/chat', async (route) => {
    sent.push(route.request().postDataJSON());
    const reply: AssistantReply = {
      answer: 'Hay 12 pza de ESP32 DevKit en el gabinete GAB-B, cajón A2.',
      hits: [
        {
          itemId: '01900000-0000-7000-8000-000000000001',
          sku: 'ESP32-WROOM',
          name: 'ESP32 DevKit',
          manufacturer: null,
          model: null,
          unitSymbol: 'pza',
          matchedAlias: null,
          onHand: 12,
          places: [
            {
              locationId: '01900000-0000-7000-8000-000000000002',
              path: 'ALM-1 / GAB-B / A2',
              code: 'A2',
              onHand: 12,
              cabinetId: '01900000-0000-7000-8000-000000000003',
              cabinetCode: 'GAB-B',
              shelfId: '01900000-0000-7000-8000-000000000004',
            },
          ],
        },
      ],
      quota: { used: sent.length + 3, limit: 50 },
    };
    await route.fulfill({ json: reply });
  });

  await page.goto('/asistente');
  await expect(page.getByText('3 de 50 preguntas este mes')).toBeVisible();
  await page.getByRole('button', { name: '¿Dónde están los ESP32?' }).click();
  const chat = page.getByRole('list', { name: 'Conversación' });
  await expect(chat.getByText('cajón A2')).toBeVisible();
  await expect(page.getByText('4 de 50 preguntas este mes')).toBeVisible();

  // La siguiente pregunta lleva el historial completo, con Enter.
  const box = page.getByLabel('Pregunta');
  await box.fill('¿Y cuántos quedan?');
  await box.press('Enter');
  await expect(chat.getByRole('listitem').filter({ hasText: 'cajón A2' })).toHaveCount(2);
  expect(sent[1]).toEqual({
    messages: [
      { role: 'user', content: '¿Dónde están los ESP32?' },
      { role: 'assistant', content: 'Hay 12 pza de ESP32 DevKit en el gabinete GAB-B, cajón A2.' },
      { role: 'user', content: '¿Y cuántos quedan?' },
    ],
  });

  await chat.getByRole('link', { name: 'Ver en 3D' }).first().click();
  await expect(page).toHaveURL(
    /\/gabinetes\/estante\/01900000-0000-7000-8000-000000000004\?resaltar=01900000-0000-7000-8000-000000000002&buscar=ESP32-WROOM/,
  );
});

test('asistente: si falla, la pregunta vuelve al campo', async ({ page, account: _ }) => {
  await page.route('**/assistant', (route) =>
    route.fulfill({ json: { enabled: true, quota: { used: 50, limit: 50 } } }),
  );
  await page.route('**/assistant/chat', (route) =>
    route.fulfill({
      status: 402,
      json: {
        code: 'ASSISTANT_LIMIT',
        message: 'Ya usó las 50 preguntas al asistente de este mes.',
      },
    }),
  );
  await page.goto('/asistente');
  const box = page.getByLabel('Pregunta');
  await box.fill('¿Qué compro?');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Ya usó las 50 preguntas' }),
  ).toBeVisible();
  await expect(box).toHaveValue('¿Qué compro?');
});
