import { z } from 'zod';
import { ROLE_VALUES } from './auth.js';

export type RoleValue = (typeof ROLE_VALUES)[number];

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: RoleValue;
  joinedAt: string;
}

export const memberRoleUpdateSchema = z.object({ role: z.enum(ROLE_VALUES) });
export type MemberRoleUpdate = z.infer<typeof memberRoleUpdateSchema>;

/** Días de validez de un enlace de invitación. */
export const INVITATION_TTL_DAYS = 7;

export const invitationInputSchema = z.object({
  email: z
    .email('Correo inválido')
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  role: z.enum(ROLE_VALUES),
});
export type InvitationInput = z.input<typeof invitationInputSchema>;

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  id: string;
  email: string;
  role: RoleValue;
  invitedByName: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

/** Respuesta de creación: el enlace solo se entrega esta vez. */
export interface InvitationCreated extends Invitation {
  url: string;
}

/** Vista previa pública de una invitación (requiere conocer el enlace). */
export interface InvitationPreview {
  organizationName: string;
  email: string;
  role: RoleValue;
  invitedByName: string;
  status: InvitationStatus;
  expiresAt: string;
}
