import type Anthropic from '@anthropic-ai/sdk';
import type { INestApplication } from '@nestjs/common';
import type { AssistantReply, AssistantStatus } from '@silopro/contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ASSISTANT_LLM, type AssistantLlm } from '../src/assistant/assistant-llm.js';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Reply = Pick<Anthropic.Beta.BetaMessage, 'content' | 'stop_reason'>;

/** Modelo simulado: devuelve las respuestas en orden y guarda cada petición. */
class FakeLlm implements AssistantLlm {
  calls: Params[] = [];
  replies: Reply[] = [];
  create(params: Params): Promise<Anthropic.Beta.BetaMessage> {
    // Copia: el servicio sigue agregando mensajes al mismo arreglo.
    this.calls.push({ ...params, messages: [...params.messages] });
    const r = this.replies.shift();
    if (!r) throw new Error('Sin respuesta preparada');
    return Promise.resolve({
      id: 'msg_prueba',
      type: 'message',
      role: 'assistant',
      model: params.model,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 20 },
      ...r,
    } as Anthropic.Beta.BetaMessage);
  }
}

const tool = (name: string, input: Record<string, unknown>, id = `tu_${name}`): Reply => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name, input } as Anthropic.Beta.BetaToolUseBlock],
});
const text = (t: string): Reply => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: t, citations: null } as Anthropic.Beta.BetaTextBlock],
});

async function asOrg(orgId: string, query: string, params: unknown[] = []) {
  const pool = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('app.organization_id', $1, true)`, [orgId]);
    await c.query(query, params);
    await c.query('commit');
  } finally {
    c.release();
    await pool.end();
  }
}

describe.skipIf(!TEST_DB)('asistente con IA', () => {
  let app: INestApplication;
  const llm = new FakeLlm();
  let s: Session;
  let espId: string;

  beforeAll(async () => {
    app = await createApp({ ANTHROPIC_API_KEY: 'sk-prueba' }, [[ASSISTANT_LLM, llm]]);
    s = await signUp(app, 'Asistente');
    const warehouse = (
      await s
        .post('/locations')
        .send({ kind: 'warehouse', code: 'ALM-1', name: 'Almacén' })
        .expect(201)
    ).body.id as string;
    const bin = (
      await s
        .post('/locations')
        .send({ kind: 'bin', code: 'CAJA-1', name: 'Caja 1', parentId: warehouse })
        .expect(201)
    ).body.id as string;
    const unitId = await pieceUnitId(s);
    espId = (
      await s.post('/items').send({ sku: 'ESP32-WROOM', name: 'ESP32 DevKit', unitId }).expect(201)
    ).body.id;
    await s
      .post('/movements')
      .send({ kind: 'receipt', itemId: espId, locationId: bin, quantity: 7 })
      .expect(201);
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    llm.calls = [];
    llm.replies = [];
  });

  const ask = (content: string) =>
    s.post('/assistant/chat').send({ messages: [{ role: 'user', content }] });

  it('informa que está activo y el cupo del plan de prueba', async () => {
    const res = await s.get('/assistant').expect(200);
    expect(res.body as AssistantStatus).toEqual({ enabled: true, quota: { used: 0, limit: 50 } });
  });

  it('localiza con la herramienta y devuelve los cajones para «Ver en 3D»', async () => {
    llm.replies = [
      tool('localizar', { texto: 'esp32' }),
      text('Hay 7 pza de ESP32 DevKit en ALM-1 / CAJA-1.'),
    ];
    const res = await ask('¿Dónde están los ESP32?').expect(200);
    const body = res.body as AssistantReply;
    expect(body.answer).toContain('7 pza');
    expect(body.hits.map((h) => h.itemId)).toEqual([espId]);
    expect(body.hits[0]!.places[0]!.onHand).toBe(7);
    expect(body.quota).toEqual({ used: 1, limit: 50 });

    // Segunda llamada: el turno del modelo y el resultado real de la herramienta.
    expect(llm.calls).toHaveLength(2);
    const [first, second] = llm.calls;
    expect(first!.model).toBe('claude-opus-5-5');
    expect(first!.tools?.map((t) => ('name' in t ? t.name : ''))).toContain('localizar');
    const last = second!.messages.at(-1)!;
    expect(last.role).toBe('user');
    const result = (last.content as Anthropic.Beta.BetaToolResultBlockParam[])[0]!;
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_localizar' });
    expect(String(result.content)).toContain('ESP32-WROOM');
    expect(String(result.content)).toContain('ALM-1 / CAJA-1');
  });

  it('consulta compras, proyectos y movimientos en una sola vuelta', async () => {
    llm.replies = [
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'a', name: 'que_comprar', input: {} },
          { type: 'tool_use', id: 'b', name: 'proyectos', input: { codigo: null } },
          { type: 'tool_use', id: 'c', name: 'movimientos', input: { articulo: 'esp32' } },
          { type: 'tool_use', id: 'd', name: 'proyectos', input: { codigo: 'NO-EXISTE' } },
        ] as Anthropic.Beta.BetaToolUseBlock[],
      },
      text('Listo.'),
    ];
    await ask('Resumen del almacén').expect(200);
    const results = llm.calls[1]!.messages.at(-1)!
      .content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(['a', 'b', 'c', 'd']);
    expect(String(results[2]!.content)).toContain('receipt');
    expect(results[3]).toMatchObject({ is_error: true });
  });

  it('una negativa del modelo responde con un mensaje fijo', async () => {
    llm.replies = [{ stop_reason: 'refusal', content: [] }];
    const res = await ask('algo fuera de lugar').expect(200);
    expect((res.body as AssistantReply).answer).toMatch(/No puedo ayudar/);
  });

  it('valida la conversación', async () => {
    await s.post('/assistant/chat').send({ messages: [] }).expect(400);
    await s
      .post('/assistant/chat')
      .send({ messages: [{ role: 'assistant', content: 'hola' }] })
      .expect(400);
    expect(llm.calls).toHaveLength(0);
  });

  it('al agotar el cupo del mes responde 402 sin llamar al modelo', async () => {
    await asOrg(s.orgId, `update assistant_usage set questions = 50 where organization_id = $1`, [
      s.orgId,
    ]);
    const res = await ask('¿Dónde están los ESP32?');
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('ASSISTANT_LIMIT');
    expect(llm.calls).toHaveLength(0);
  });

  it('otra organización no ve el uso ajeno', async () => {
    const other = await signUp(app, 'Otra');
    const res = await other.get('/assistant').expect(200);
    expect((res.body as AssistantStatus).quota.used).toBe(0);
  });
});

describe.skipIf(!TEST_DB)('asistente sin clave de API', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => app?.close());

  it('aparece desactivado y el chat responde 503', async () => {
    const s = await signUp(app, 'SinClave');
    expect((await s.get('/assistant').expect(200)).body.enabled).toBe(false);
    const res = await s
      .post('/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'hola' }] });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ASSISTANT_DISABLED');
  });
});
