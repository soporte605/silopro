import { z } from 'zod';

export const ROLE_VALUES = ['owner', 'admin', 'operator', 'viewer'] as const;

const email = z
  .email('Correo inválido')
  .max(254)
  .transform((v) => v.trim().toLowerCase());

/** Mínimo 10 caracteres; sin reglas de composición (NIST SP 800-63B). */
const password = z.string().min(10, 'Mínimo 10 caracteres').max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email,
  password,
  organizationName: z.string().trim().min(2).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export type LoginInput = z.infer<typeof loginSchema>;

/** Token de un enlace enviado por correo (32 bytes en base64url). */
const linkToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Enlace inválido');

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: linkToken, password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: linkToken });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const membershipSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  role: z.enum(ROLE_VALUES),
});

export const meSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    /** Confirmó su correo con el enlace enviado. */
    emailVerified: z.boolean(),
  }),
  memberships: z.array(membershipSchema),
});
export type Me = z.infer<typeof meSchema>;
