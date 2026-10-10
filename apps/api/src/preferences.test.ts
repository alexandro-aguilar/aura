import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildServer } from './server.js';
import { readConfig } from './config.js';
const servers: Awaited<ReturnType<typeof buildServer>>[] = [];
async function setup(env: NodeJS.ProcessEnv = {}) {
  const server = await buildServer(
    readConfig({ DATABASE_PATH: ':memory:', ...env }),
    { logger: false },
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
    const { app, persistence } = await setup({ MEMORY_ENABLED: 'true' });
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
      MEMORY_ENABLED: 'true',
    });
    try {
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
        MEMORY_ENABLED: 'true',
      });
      expect(server.persistence.preferences.list()).toMatchObject([
        { id: saved.id, value: 'es' },
      ]);
      await server.app.inject({
        method: 'DELETE',
        url: `/preferences/${saved.id}`,
      });
      await server.app.close();
      servers.splice(servers.indexOf(server), 1);
      server = await setup({ DATABASE_PATH: databasePath });
      expect(server.persistence.preferences.list()).toEqual([]);
    } finally {
      await server.app.close();
      servers.splice(servers.indexOf(server), 1);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
