import { z } from 'zod';
import type { LocateHit } from './locate.js';

// ── Asistente con IA ──────────────────────────────────────────────────────
// Chat escrito sobre el inventario. La conversación vive en el navegador y se
// envía completa en cada pregunta (solo texto); la API no la guarda.

export const ASSISTANT_MAX_TURNS = 20;
export const ASSISTANT_MAX_CHARS = 2000;

export const assistantChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(ASSISTANT_MAX_CHARS),
      }),
    )
    .min(1)
    .max(ASSISTANT_MAX_TURNS)
    .refine((m) => m.at(-1)?.role === 'user', 'El último mensaje debe ser una pregunta')
    .refine((m) => m[0]?.role === 'user', 'La conversación empieza con una pregunta'),
});
export type AssistantChat = z.input<typeof assistantChatSchema>;
export type AssistantTurn = AssistantChat['messages'][number];

/** Cupo del mes: preguntas hechas y límite del plan (`null` = sin límite). */
export interface AssistantQuota {
  used: number;
  limit: number | null;
}

export interface AssistantStatus {
  /** `false` si el servidor no tiene configurada la IA. */
  enabled: boolean;
  quota: AssistantQuota;
}

export interface AssistantReply {
  answer: string;
  /** Artículos que el asistente localizó, con sus cajones (para «Ver en 3D»). */
  hits: LocateHit[];
  quota: AssistantQuota;
}
