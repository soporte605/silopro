import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../config/env.js';

/**
 * Lo único que el asistente necesita del cliente de Claude: una petición de
 * Messages (beta, por las respuestas de reserva). Separado para poder
 * sustituirlo en pruebas sin llamar a la API real.
 */
export interface AssistantLlm {
  create(
    params: Anthropic.Beta.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Beta.BetaMessage>;
}

export const ASSISTANT_LLM = Symbol('ASSISTANT_LLM');

/** Cliente real si hay `ANTHROPIC_API_KEY`; `null` deja el asistente desactivado. */
export function assistantLlmFactory(env: Env): AssistantLlm | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 120_000 });
  return { create: (params) => client.beta.messages.create(params) };
}
