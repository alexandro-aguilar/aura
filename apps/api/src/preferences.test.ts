import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildServer } from './server.js';
import { readConfig } from './config.js';
import { MockSpeech } from '@aura/integrations';
import {
  chatEventSchema,
  pcmToWav,
  encodeBase64,
  voiceEventSchema,
} from '@aura/contracts';
const servers: Awaited<ReturnType<typeof buildServer>>[] = [];
async function setup(
  env: NodeJS.ProcessEnv = {},
  options: Parameters<typeof buildServer>[1] = {},
) {
  const server = await buildServer(
    readConfig({ DATABASE_PATH: ':memory:', ...env }),
    { logger: false, ...options },
  );
  servers.push(server);
  return server;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(({ app }) => app.close()));
});
const preference = {
  category: 'response_language',
  value: 'es',
  consent: true,
};
describe('explicit presentation memory', () => {
  it('applies live memory changes to subsequent turns on an existing WebSocket', async () => {
    const { app } = await setup();
    await app.inject({
      method: 'POST',
      url: '/preferences',
      payload: preference,
    });
    const socket = await app.injectWS('/chat/stream');
    const turn = () =>
      new Promise<string>((resolve, reject) => {
        const receive = (raw: { toString(): string }) => {
          try {
            const event = chatEventSchema.parse(JSON.parse(raw.toString()));
            if (event.type === 'done') {
              socket.off('message', receive);
              resolve(event.message);
            }
            if (event.type === 'error') {
              socket.off('message', receive);
              reject(new Error(event.message));
            }
          } catch (error) {
            socket.off('message', receive);
            reject(error);
          }
        };
        socket.on('message', receive);
        socket.send(JSON.stringify({ message: 'show preferences' }));
      });
    try {
      expect(await turn()).toBe('No approved preferences are active.');
      await app.inject({
        method: 'POST',
        url: '/preferences/control',
        payload: { enabled: true, consent: true },
      });
      expect(await turn()).toContain('response_language: es');
      await app.inject({
        method: 'POST',
        url: '/preferences/control',
        payload: { enabled: false },
      });
      expect(await turn()).toBe('No approved preferences are active.');
    } finally {
      socket.close();
    }
  });
  it('applies live memory changes to subsequent voice turns', async () => {
    const { app } = await setup(
      {},
      { speech: new MockSpeech('show preferences') },
    );
    await app.inject({
      method: 'POST',
      url: '/preferences',
      payload: preference,
    });
    for (const enabled of [false, true, false]) {
      await app.inject({
        method: 'POST',
        url: '/preferences/control',
        payload: enabled ? { enabled, consent: true } : { enabled },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/voice/turn',
        headers: { origin: 'http://localhost:5173' },
        payload: { audioBase64: encodeBase64(pcmToWav(new Uint8Array(32000))) },
      });
      expect(response.statusCode).toBe(200);
      const events = response.body
        .trim()
        .split('\n')
        .map((line) => voiceEventSchema.parse(JSON.parse(line)));
      const text = events.find((event) => event.type === 'response')?.message;
      expect(text).toBe(
        enabled
          ? 'response_language: es'
          : 'No approved preferences are active.',
      );
    }
  });
  it('requires consent to enable memory and rejects extra fields and foreign origins', async () => {
    const { app } = await setup({ MEMORY_ENABLED: 'true' });
    for (const payload of [
      {},
      { enabled: true },
      { enabled: true, consent: false },
      { enabled: 'true', consent: true },
      { enabled: true, consent: true, permissions: ['*'] },
      { enabled: false, permissions: ['*'] },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/preferences/control',
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/preferences/control',
          headers: { origin: 'https://untrusted.example' },
          payload: { enabled: true, consent: true },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject('/preferences')).json().enabled).toBe(false);
  });
  it('enables and disables context immediately without deleting saved preferences', async () => {
    const { app } = await setup();
    await app.inject({
      method: 'POST',
      url: '/preferences',
      payload: preference,
    });
    const first = (
      await app.inject({
        method: 'POST',
        url: '/chat',
        payload: { message: 'show preferences' },
      })
    ).json();
    expect(first.message).toBe('No approved preferences are active.');
    const turn = () =>
      app.inject({
        method: 'POST',
        url: '/chat',
        payload: {
          conversationId: first.conversationId,
          message: 'show preferences',
        },
      });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/preferences/control',
          payload: { enabled: true, consent: true },
        })
      ).json(),
    ).toEqual({ enabled: true });
    expect((await turn()).json().message).toContain('response_language: es');
    expect((await app.inject('/preferences')).json().enabled).toBe(true);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/preferences/control',
          payload: { enabled: false },
        })
      ).json(),
    ).toEqual({ enabled: false });
    expect((await turn()).json().message).toBe(
      'No approved preferences are active.',
    );
    expect((await app.inject('/preferences')).json().preferences).toHaveLength(
      1,
    );
  });
  it('requires explicit consent, fixed categories/values and existing provenance', async () => {
    const { app } = await setup();
    for (const payload of [
      { ...preference, consent: false },
      { category: 'response_language', value: 'es' },
      { ...preference, category: 'device_grant' },
      { ...preference, value: 'turn on living room' },
      { ...preference, permissions: ['*'] },
    ])
      expect(
        (await app.inject({ method: 'POST', url: '/preferences', payload }))
          .statusCode,
      ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/preferences',
          payload: {
            ...preference,
            sourceConversationId: '00000000-0000-4000-8000-000000000000',
          },
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject('/preferences')).json()).toEqual({
      enabled: false,
      preferences: [],
    });
  });
  it('edits the same category, exposes provenance and deletes from subsequent turn context', async () => {
    const { app, persistence } = await setup();
    await app.inject({
      method: 'POST',
      url: '/preferences/control',
      payload: { enabled: true, consent: true },
    });
    const saved = (
      await app.inject({
        method: 'POST',
        url: '/preferences',
        payload: preference,
      })
    ).json();
    expect(saved).toMatchObject({
      source: 'operator',
      value: 'es',
      sourceConversationId: null,
    });
    const first = (
      await app.inject({
        method: 'POST',
        url: '/chat',
        payload: { message: 'show preferences' },
      })
    ).json();
    expect(first.message).toContain('response_language: es');
    const edited = (
      await app.inject({
        method: 'POST',
        url: '/preferences',
        payload: {
          ...preference,
          value: 'en',
          sourceConversationId: first.conversationId,
        },
      })
    ).json();
    expect(edited.id).toBe(saved.id);
    expect(edited.sourceConversationId).toBe(first.conversationId);
    expect(persistence.preferences.list()).toHaveLength(1);
    expect(
      (await app.inject({ method: 'DELETE', url: `/preferences/${saved.id}` }))
        .statusCode,
    ).toBe(204);
    const next = (
      await app.inject({
        method: 'POST',
        url: '/chat',
        payload: {
          conversationId: first.conversationId,
          message: 'show preferences',
        },
      })
    ).json();
    expect(next.message).toBe('No approved preferences are active.');
    expect(
      (await app.inject({ method: 'DELETE', url: `/preferences/${saved.id}` }))
        .statusCode,
    ).toBe(404);
  });
  it('never injects saved preferences when the server context switch is off', async () => {
    const { app } = await setup();
    await app.inject({
      method: 'POST',
      url: '/preferences',
      payload: preference,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/chat',
          payload: { message: 'show preferences' },
        })
      ).json().message,
    ).toBe('No approved preferences are active.');
  });
  it('preserves approved memory across restart and its deletion across the next restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'aura-memory-'));
    const databasePath = join(directory, 'aura.sqlite');
    let server = await setup({
      DATABASE_PATH: databasePath,
    });
    try {
      await server.app.inject({
        method: 'POST',
        url: '/preferences/control',
        payload: { enabled: true, consent: true },
      });
      const saved = (
        await server.app.inject({
          method: 'POST',
          url: '/preferences',
          payload: preference,
        })
      ).json();
      await server.app.close();
      servers.splice(servers.indexOf(server), 1);
      server = await setup({
        DATABASE_PATH: databasePath,
      });
      expect((await server.app.inject('/preferences')).json().enabled).toBe(
        true,
      );
      expect(
        (
          await server.app.inject({
            method: 'POST',
            url: '/chat',
            payload: { message: 'show preferences' },
          })
        ).json().message,
      ).toContain('response_language: es');
      expect(server.persistence.preferences.list()).toMatchObject([
        { id: saved.id, value: 'es' },
      ]);
      await server.app.inject({
        method: 'DELETE',
        url: `/preferences/${saved.id}`,
      });
      await server.app.inject({
        method: 'POST',
        url: '/preferences/control',
        payload: { enabled: false },
      });
      await server.app.close();
      servers.splice(servers.indexOf(server), 1);
      server = await setup({ DATABASE_PATH: databasePath });
      expect(server.persistence.preferences.list()).toEqual([]);
      expect((await server.app.inject('/preferences')).json().enabled).toBe(
        false,
      );
    } finally {
      await server.app.close();
      servers.splice(servers.indexOf(server), 1);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
