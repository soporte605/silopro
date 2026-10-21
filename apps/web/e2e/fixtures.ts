import { test as base, expect, type Page } from '@playwright/test';

/** Requiere la API en marcha (ng serve redirige /api a localhost:3000). */
export interface Account {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}

export function newAccount(prefix = 'e2e'): Account {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return {
    email: `${prefix}-${id}@ejemplo.test`,
    password: 'clave-segura-123',
    name: 'Ana Pruebas',
    organizationName: `Taller ${id}`,
  };
}

/** Crea la cuenta por API; la cookie de sesión queda en el contexto del navegador. */
export async function register(page: Page, account = newAccount()): Promise<Account> {
  const res = await page.request.post('/api/auth/register', {
    headers: { 'X-SiloPro-Request': '1' },
    data: account,
  });
  expect(res.status(), await res.text()).toBe(201);
  return account;
}

export const test = base.extend<{ account: Account }>({
  account: async ({ page }, use) => {
    await use(await register(page));
  },
});

export { expect };
