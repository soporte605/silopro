import { hash, verify } from '@node-rs/argon2';

// Argon2id con los parámetros recomendados por OWASP (19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe. */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword('contraseña-ficticia-para-tiempo-constante');
  return dummy;
}
