import Anthropic from '@anthropic-ai/sdk';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  AssistantQuota,
  AssistantReply,
  AssistantStatus,
  assistantChatSchema,
  LocateHit,
} from '@silopro/contracts';
import { ASSISTANT_MONTHLY_QUESTIONS, assistantPeriod, withinLimit } from '@silopro/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { orgPlan } from '../billing/plan-limits.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assistantUsage } from '../db/schema.js';
import { ProjectsService } from '../projects/projects.service.js';
import { ShoppingService } from '../projects/shopping.service.js';
import { LocateService } from '../stock/locate.service.js';
import { MovementsService } from '../stock/movements.service.js';
import { ASSISTANT_LLM, type AssistantLlm } from './assistant-llm.js';
import { ASSISTANT_TOOLS, runAssistantTool, type ToolDeps } from './assistant-tools.js';

/** Vueltas máximas de herramientas por pregunta (evita bucles costosos). */
const MAX_STEPS = 6;
const MAX_HITS = 10;

const SYSTEM = `Eres el asistente de almacén de SiloPro, un sistema de inventario para talleres y laboratorios de electrónica en México. Respondes en español, breve y directo, como un compañero que conoce el almacén.

Reglas:
- Para cualquier dato del inventario (dónde está algo, cuánto hay, qué falta, qué comprar, proyectos, movimientos) usa las herramientas. Nunca inventes artículos, ubicaciones, cantidades ni fechas: si una herramienta no lo devuelve, dilo.
- Si «localizar» no encuentra nada, prueba una o dos variantes (singular, sin marca, otra palabra) antes de rendirte.
- Al decir dónde está algo, da la ruta y el cajón tal como vienen, y la cantidad con su unidad. La pantalla muestra botones «Ver en 3D» para lo que localizaste, así que no pegues enlaces.
- Solo puedes consultar. Si te piden registrar entradas, salidas o cambios, explica dónde hacerlo en SiloPro (Movimientos, Artículos, Proyectos).
- Responde en texto simple; usa listas cortas solo cuando ayuden. Sin tablas.
- Si te preguntan algo ajeno al almacén, responde con amabilidad que solo ayudas con el inventario.`;

@Injectable()
export class AssistantService {
  private readonly log = new Logger(AssistantService.name);
  private readonly deps: ToolDeps;

  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(ENV) private readonly env: Env,
    @Inject(ASSISTANT_LLM) private readonly llm: AssistantLlm | null,
    @Inject(LocateService) locate: LocateService,
    @Inject(ShoppingService) shopping: ShoppingService,
    @Inject(ProjectsService) projects: ProjectsService,
    @Inject(MovementsService) movements: MovementsService,
  ) {
    this.deps = { locate, shopping, projects, movements };
  }

  status(ctx: OrgContext): Promise<AssistantStatus> {
    return this.dbs.tenant(ctx, async (tx) => ({
      enabled: this.llm !== null,
      quota: await this.quota(tx, ctx.organizationId),
    }));
  }

  async chat(ctx: OrgContext, body: z.output<typeof assistantChatSchema>): Promise<AssistantReply> {
    const llm = this.llm;
    if (!llm) {
      throw new ServiceUnavailableException({
        code: 'ASSISTANT_DISABLED',
        message: 'El asistente con IA no está activado en este servidor.',
      });
    }
    const before = await this.dbs.tenant(ctx, (tx) => this.quota(tx, ctx.organizationId));
    if (!withinLimit(before.limit, before.used)) {
      throw new HttpException(
        {
          code: 'ASSISTANT_LIMIT',
          message: `Ya usó las ${before.limit} preguntas al asistente de este mes. Se renuevan el día 1, o cambie de plan para tener más.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const messages: Anthropic.Beta.BetaMessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const hits = new Map<string, LocateHit>();
    let inputTokens = 0;
    let outputTokens = 0;
    let answer = '';

    for (let step = 0; step < MAX_STEPS && !answer; step++) {
      const res = await this.call(llm, messages);
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;

      if (res.stop_reason === 'refusal') {
        answer = 'No puedo ayudar con eso. Pregúnteme sobre el inventario del almacén.';
        break;
      }
      const toolUses = res.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
      );
      if (res.stop_reason === 'pause_turn' || (res.stop_reason === 'tool_use' && toolUses.length)) {
        messages.push({ role: 'assistant', content: res.content });
        if (toolUses.length) {
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const use of toolUses) {
            const out = await runAssistantTool(
              this.deps,
              ctx,
              use.name,
              (use.input ?? {}) as Record<string, unknown>,
            ).catch((err: unknown) => {
              this.log.warn(`Herramienta ${use.name} falló: ${String(err)}`);
              return { content: 'No se pudo consultar; intente de otra forma.', isError: true };
            });
            for (const h of 'hits' in out ? (out.hits ?? []) : []) {
              if (!hits.has(h.itemId) && h.places.length) hits.set(h.itemId, h);
            }
            results.push({
              type: 'tool_result',
              tool_use_id: use.id,
              content: out.content,
              ...(out.isError ? { is_error: true } : {}),
            });
          }
          messages.push({ role: 'user', content: results });
        }
        continue;
      }
      answer = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (!answer) answer = 'No tengo una respuesta para eso. ¿Puede preguntarlo de otra forma?';
    }
    if (!answer) {
      answer =
        'La consulta requirió demasiados pasos. Intente una pregunta más concreta, p. ej. «¿dónde están los ESP32?».';
    }

    const quota = await this.dbs.tenant(ctx, async (tx) => {
      await tx
        .insert(assistantUsage)
        .values({
          organizationId: ctx.organizationId,
          period: assistantPeriod(),
          questions: 1,
          inputTokens,
          outputTokens,
        })
        .onConflictDoUpdate({
          target: [assistantUsage.organizationId, assistantUsage.period],
          set: {
            questions: sql`${assistantUsage.questions} + 1`,
            inputTokens: sql`${assistantUsage.inputTokens} + ${inputTokens}`,
            outputTokens: sql`${assistantUsage.outputTokens} + ${outputTokens}`,
            updatedAt: sql`now()`,
          },
        });
      return this.quota(tx, ctx.organizationId);
    });
    return { answer, hits: [...hits.values()].slice(0, MAX_HITS), quota };
  }

  private async call(
    llm: AssistantLlm,
    messages: Anthropic.Beta.BetaMessageParam[],
  ): Promise<Anthropic.Beta.BetaMessage> {
    try {
      return await llm.create({
        model: this.env.ASSISTANT_MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM,
        tools: ASSISTANT_TOOLS,
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new HttpException(
          {
            code: 'ASSISTANT_BUSY',
            message: 'El asistente está ocupado. Intente de nuevo en un minuto.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (err instanceof Anthropic.APIError) {
        this.log.error(`Claude respondió ${err.status ?? '?'}: ${err.message}`);
        throw new ServiceUnavailableException({
          code: 'ASSISTANT_UNAVAILABLE',
          message: 'El asistente no está disponible en este momento. Intente más tarde.',
        });
      }
      throw err;
    }
  }

  private async quota(tx: Tx, organizationId: string): Promise<AssistantQuota> {
    const plan = await orgPlan(tx, organizationId);
    const [row] = await tx
      .select({ questions: assistantUsage.questions })
      .from(assistantUsage)
      .where(
        and(
          eq(assistantUsage.organizationId, organizationId),
          eq(assistantUsage.period, assistantPeriod()),
        ),
      );
    return { used: row?.questions ?? 0, limit: ASSISTANT_MONTHLY_QUESTIONS[plan.plan] };
  }
}
