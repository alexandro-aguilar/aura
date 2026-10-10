import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { chatEventSchema } from '@aura/contracts';
import type { ChatEvent } from '@aura/contracts';
import { buildServer } from './server.js';
import { readConfig } from './config.js';

const servers: Awaited<ReturnType<typeof buildServer>>[] = [];
async function setup(agent?: Parameters<typeof buildServer>[1]) {
  const server = await buildServer(readConfig({ DATABASE_PATH: ':memory:' }), {
    logger: false,
    ...agent,
  });
  servers.push(server);
  return server;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(({ app }) => app.close()));
});

describe('MVP 1 API', () => {
  it('runs HTTP chat through mock tool, persistence, history, and audit', async () => {
    const { app, persistence } = await setup();
    expect((await app.inject('/health')).json()).toEqual({
      status: 'ok',
      mode: 'mock',
      devices: 'mock',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { message: 'turn on living room' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ conversationId: string; message: string }>();
    expect(body.message).toBe('Living room light is on (mock).');
    const history = await app.inject(
      `/conversations/${body.conversationId}/messages`,
    );
    expect(history.json()).toMatchObject([
      { role: 'user' },
      { role: 'assistant' },
    ]);
    expect(persistence.audit.list(body.conversationId)).toMatchObject([
      { deviceId: 'light.living_room', status: 'succeeded' },
    ]);
    const followup = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { conversationId: body.conversationId, message: 'status' },
    });
    expect(followup.json().message).toContain('Living room: on');
  });
  it('rejects invalid bodies and unknown conversations', async () => {
    const { app } = await setup();
    for (const payload of [
      { message: '' },
      { message: 'ok', history: [] },
      { message: 'x'.repeat(4001) },
    ]) {
      expect(
        (await app.inject({ method: 'POST', url: '/chat', payload }))
          .statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/chat',
          payload: { message: 'hello', conversationId: randomUUID() },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('rejects foreign browser origins', async () => {
    const { app } = await setup();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/chat',
          headers: { origin: 'https://untrusted.example' },
          payload: { message: 'hello' },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('streams ordered WebSocket events and persists the completed turn', async () => {
    const { app, persistence } = await setup();
    const socket = await app.injectWS('/chat/stream');
    try {
      const events = await new Promise<ChatEvent[]>((resolve, reject) => {
        const received: ChatEvent[] = [];
        socket.on('error', reject);
        socket.on('message', (raw) => {
          try {
            const event = chatEventSchema.parse(JSON.parse(raw.toString()));
            received.push(event);
            if (event.type === 'done') resolve(received);
            if (event.type === 'error') reject(new Error(event.message));
          } catch (error) {
            reject(error);
          }
        });
        socket.send(JSON.stringify({ message: 'turn on bedroom' }));
      });
      const done = events.at(-1);
      expect(events[0]?.type).toBe('started');
      if (done?.type !== 'done') throw new Error('Missing done event');
      expect(
        events
          .filter((event) => event.type === 'delta')
          .map((event) => (event.type === 'delta' ? event.text : ''))
          .join(''),
      ).toBe(done.message);
      expect(
        persistence.conversations.messages(done.conversationId),
      ).toHaveLength(2);
      expect(persistence.audit.list(done.conversationId)[0]?.status).toBe(
        'succeeded',
      );
    } finally {
      socket.close();
    }
  });
  it('returns a public error without leaking provider failure details', async () => {
    const { app } = await setup({
      agent: {
        stream: async function* () {
          throw new Error('secret-provider-details');
          yield '';
        },
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { message: 'hello' },
    });
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('secret-provider-details');
  });
});

describe('server configuration', () => {
  it('defaults to credential-free mock mode', () =>
    expect(readConfig({}).mode).toBe('mock'));
  it('fails fast on invalid mode, port, or missing live credentials', () => {
    expect(() => readConfig({ AGENT_MODE: 'other' })).toThrow();
    expect(() => readConfig({ PORT: '0' })).toThrow();
    expect(() => readConfig({ AGENT_MODE: 'openai' })).toThrow(
      'OPENAI_API_KEY',
    );
  });
});
