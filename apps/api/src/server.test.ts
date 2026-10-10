import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { chatEventSchema } from '@aura/contracts';
import type { ChatEvent } from '@aura/contracts';
import { buildServer } from './server.js';
import { readConfig } from './config.js';

const servers: Awaited<ReturnType<typeof buildServer>>[] = [];
async function setup(
  agent?: Parameters<typeof buildServer>[1],
  env: NodeJS.ProcessEnv = {},
) {
  const server = await buildServer(
    readConfig({ ...env, DATABASE_PATH: ':memory:' }),
    {
      logger: false,
      ...agent,
    },
  );
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
  it('finishes and persists an accepted turn after its socket disconnects', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app, persistence } = await setup({
      agent: {
        stream: async function* () {
          await gate;
          yield 'Completed after disconnect.';
        },
      },
    });
    const socket = await app.injectWS('/chat/stream');
    try {
      const started = once(socket, 'message');
      socket.send(JSON.stringify({ message: 'hello' }));
      const [raw] = await started;
      const event = chatEventSchema.parse(JSON.parse(raw.toString()));
      if (event.type !== 'started') throw new Error('Expected started');
      const closed = once(socket, 'close');
      socket.close();
      await closed;
      release();
      await expect
        .poll(() =>
          persistence.conversations
            .messages(event.conversationId)
            .map((item) => item.content),
        )
        .toEqual(['hello', 'Completed after disconnect.']);
    } finally {
      release();
      socket.close();
    }
  });
  it('rejects a concurrent HTTP turn while a WebSocket turn owns the conversation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app } = await setup({
      agent: {
        stream: async function* () {
          await gate;
          yield 'ok';
        },
      },
    });
    const socket = await app.injectWS('/chat/stream');
    try {
      const started = once(socket, 'message');
      socket.send(JSON.stringify({ message: 'first' }));
      const [raw] = await started;
      const event = chatEventSchema.parse(JSON.parse(raw.toString()));
      if (event.type !== 'started') throw new Error('Expected started');
      const response = await app.inject({
        method: 'POST',
        url: '/chat',
        payload: { conversationId: event.conversationId, message: 'second' },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('BUSY');
      const completed = new Promise<void>((resolve, reject) => {
        socket.on('message', (raw) => {
          const event = chatEventSchema.parse(JSON.parse(raw.toString()));
          if (event.type === 'done') resolve();
          if (event.type === 'error') reject(new Error(event.message));
        });
      });
      release();
      await completed;
      const followup = await app.inject({
        method: 'POST',
        url: '/chat',
        payload: { conversationId: event.conversationId, message: 'third' },
      });
      expect(followup.statusCode).toBe(200);
    } finally {
      release();
      socket.close();
    }
  });
  it('rejects malformed WebSocket requests without creating a turn and accepts the next valid request', async () => {
    const { app } = await setup();
    const socket = await app.injectWS('/chat/stream');
    try {
      for (const input of [
        '{',
        JSON.stringify({ message: 'ok', grants: ['*'] }),
      ]) {
        const received = once(socket, 'message');
        socket.send(input);
        const [raw] = await received;
        expect(chatEventSchema.parse(JSON.parse(raw.toString()))).toMatchObject(
          {
            type: 'error',
            code: 'INVALID_REQUEST',
          },
        );
      }
      const completed = new Promise<ChatEvent>((resolve) => {
        socket.on('message', (raw) => {
          const event = chatEventSchema.parse(JSON.parse(raw.toString()));
          if (event.type === 'done') resolve(event);
        });
      });
      socket.send(JSON.stringify({ message: 'status' }));
      expect((await completed).type).toBe('done');
    } finally {
      socket.close();
    }
  });
  it('exposes a public WebSocket error and retains only the user turn after partial output fails', async () => {
    const { app, persistence } = await setup({
      agent: {
        stream: async function* () {
          yield 'Partial';
          throw new Error('secret-provider-details');
        },
      },
    });
    const socket = await app.injectWS('/chat/stream');
    try {
      const failed = new Promise<ChatEvent[]>((resolve) => {
        const received: ChatEvent[] = [];
        socket.on('message', (raw) => {
          const event = chatEventSchema.parse(JSON.parse(raw.toString()));
          received.push(event);
          if (event.type === 'error') resolve(received);
        });
      });
      socket.send(JSON.stringify({ message: 'hello' }));
      const events = await failed;
      expect(events.map((event) => event.type)).toEqual([
        'started',
        'delta',
        'error',
      ]);
      expect(events.at(-1)).toMatchObject({ code: 'AGENT_ERROR' });
      expect(JSON.stringify(events)).not.toContain('secret-provider-details');
      const started = events[0];
      if (started?.type !== 'started') throw new Error('Expected started');
      expect(
        persistence.conversations.messages(started.conversationId),
      ).toMatchObject([{ role: 'user', content: 'hello' }]);
    } finally {
      socket.close();
    }
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

describe('read-only Home Assistant API', () => {
  const env = {
    DEVICE_BACKEND: 'home-assistant',
    HA_URL: 'http://ha.fixture:8123',
    HA_TOKEN: 'fixture-only',
    HA_LIGHT_IDS: 'light.living_room',
  };
  it('lists configured real states through HTTP and chat but refuses write requests', async () => {
    const deviceFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () =>
        Response.json({
          entity_id: 'light.living_room',
          state: 'unavailable',
          attributes: { friendly_name: 'Living room' },
        }),
      );
    const { app, persistence, devices } = await setup({ deviceFetch }, env);
    expect((await app.inject('/health')).json()).toEqual({
      status: 'ok',
      mode: 'mock',
      devices: 'home-assistant',
    });
    expect(deviceFetch).not.toHaveBeenCalled(); // Health is local, not an upstream probe.
    expect((await app.inject('/devices')).json()).toMatchObject([
      { id: 'light.living_room', state: 'unavailable' },
    ]);
    const status = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { message: 'status' },
    });
    expect(status.json().message).toContain('Living room: unavailable');
    const write = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { message: 'turn on living room' },
    });
    expect(write.json().message).toContain('read-only');
    expect(persistence.audit.list(write.json().conversationId)).toEqual([]);
    await expect(
      devices.setLight({ deviceId: 'light.living_room', state: 'on' }),
    ).rejects.toMatchObject({ code: 'READ_ONLY' });
    expect(deviceFetch).toHaveBeenCalledTimes(2);
    expect(
      deviceFetch.mock.calls.every(([, init]) => init?.method === 'GET'),
    ).toBe(true);
  });
  it('reports an actionable sanitized failure and recovers on the next explicit read', async () => {
    const deviceFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('fixture-only', { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          entity_id: 'light.living_room',
          state: 'off',
          attributes: {},
        }),
      );
    const { app } = await setup({ deviceFetch }, env);
    const failed = await app.inject('/devices');
    expect(failed.statusCode).toBe(503);
    expect(failed.json().code).toBe('DEVICE_AUTH_FAILED');
    expect(failed.body).not.toContain('fixture-only');
    const recovered = await app.inject('/devices');
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toMatchObject([{ state: 'off' }]);
  });
  it('uses native HTTP against a fixture server and never dispatches a write', async () => {
    const requests: string[] = [];
    const fixture = createServer((request, response) => {
      requests.push(`${request.method} ${request.url}`);
      if (request.headers.authorization !== `Bearer ${env.HA_TOKEN}`) {
        response.writeHead(401).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          entity_id: 'light.living_room',
          state: 'unknown',
          attributes: { friendly_name: 'Fixture light' },
        }),
      );
    });
    fixture.listen(0, '127.0.0.1');
    await once(fixture, 'listening');
    try {
      const address = fixture.address();
      if (!address || typeof address === 'string')
        throw new Error('Expected fixture port');
      const { app } = await setup(
        {},
        { ...env, HA_URL: `http://127.0.0.1:${address.port}` },
      );
      const response = await app.inject('/devices');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject([
        { name: 'Fixture light', state: 'unknown' },
      ]);
      const write = await app.inject({
        method: 'POST',
        url: '/chat',
        payload: { message: 'turn on living room' },
      });
      expect(write.json().message).toContain('read-only');
      expect(requests).toEqual(['GET /api/states/light.living_room']);
    } finally {
      fixture.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        fixture.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
