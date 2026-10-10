import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from './server.js';
import { readConfig } from './config.js';

const servers: Awaited<ReturnType<typeof buildServer>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(({ app }) => app.close()));
});
const ha = {
  DEVICE_BACKEND: 'home-assistant',
  HA_URL: 'http://ha.fixture',
  HA_TOKEN: 'server-secret',
  HA_LIGHT_IDS: 'light.kitchen,light.office',
  HA_WRITE_LIGHT_IDS: 'light.kitchen',
  HA_CONFIRMATION_TIMEOUT_MS: '10',
};
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
function fixture() {
  let state = 'off';
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (url, init) => {
      if (init?.method === 'POST') {
        expect(new URL(url.toString()).pathname).toBe(
          '/api/services/light/turn_on',
        );
        expect(JSON.parse(String(init.body))).toEqual({
          entity_id: 'light.kitchen',
        });
        state = 'on';
        return Response.json([]);
      }
      const id = new URL(url.toString()).pathname.split('/').at(-1);
      return Response.json({
        entity_id: id,
        state,
        attributes: { friendly_name: 'Kitchen' },
      });
    });
  return fetch;
}
const payload = { deviceId: 'light.kitchen', state: 'on' };

describe('provider-independent direct controls', () => {
  it('executes a real adapter write despite provider failure and exposes durable audit/history context', async () => {
    const deviceFetch = fixture();
    const { app } = await setup(ha, {
      deviceFetch,
      agent: {
        stream: async function* () {
          throw new Error('provider unavailable');
          yield '';
        },
      },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/chat',
          payload: { message: 'hello' },
        })
      ).statusCode,
    ).toBe(502);
    const response = await app.inject({
      method: 'POST',
      url: '/device-operations',
      payload,
    });
    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result).toMatchObject({
      device: { id: payload.deviceId, state: 'on', canControl: true },
    });
    expect(result.operationId).toBeTruthy();
    const audit = await app.inject(
      `/conversations/${result.conversationId}/audit`,
    );
    expect(audit.json()).toMatchObject([
      { id: result.operationId, status: 'succeeded' },
    ]);
    expect(
      (
        await app.inject(`/conversations/${result.conversationId}/messages`)
      ).json(),
    ).toEqual([]);
    expect(
      deviceFetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
  it('uses the same audit policy for agent and direct operations and never fetches ungranted targets', async () => {
    const deviceFetch = fixture();
    const { app } = await setup(ha, { deviceFetch });
    const denied = await app.inject({
      method: 'POST',
      url: '/device-operations',
      payload: { deviceId: 'light.office', state: 'on' },
    });
    expect(denied.statusCode).toBe(403);
    expect(
      (
        await app.inject(`/conversations/${denied.json().conversationId}/audit`)
      ).json(),
    ).toMatchObject([{ status: 'denied' }]);
    const chatDenied = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { message: 'turn on light.office' },
    });
    expect(chatDenied.json().code).toBe('FORBIDDEN');
    expect(deviceFetch).not.toHaveBeenCalled();
    const chat = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { message: 'turn on light.kitchen' },
    });
    expect(chat.statusCode).toBe(200);
    expect(chat.json().message).toBe('Kitchen light is on.');
    expect(
      (
        await app.inject(`/conversations/${chat.json().conversationId}/audit`)
      ).json(),
    ).toMatchObject([{ status: 'succeeded' }]);
  });
  it('validates direct input and context before creating/executing an operation', async () => {
    const deviceFetch = fixture();
    const { app } = await setup(ha, { deviceFetch });
    for (const bad of [
      { ...payload, service: 'unlock' },
      { ...payload, state: 'toggle' },
      { ...payload, grants: ['*'] },
      { ...payload, conversationId: 'bad' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/device-operations',
            payload: bad,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/device-operations',
          payload: { ...payload, conversationId: randomUUID() },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/device-operations',
          headers: { origin: 'https://untrusted.example' },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(deviceFetch).not.toHaveBeenCalled();
  });
  it('returns an uncertain receipt and audit when dispatch loses its response', async () => {
    const deviceFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({
          entity_id: payload.deviceId,
          state: 'off',
          attributes: {},
        }),
      )
      .mockRejectedValueOnce(new Error('server-secret'))
      .mockResolvedValueOnce(
        Response.json({
          entity_id: payload.deviceId,
          state: 'on',
          attributes: {},
        }),
      );
    const { app } = await setup(ha, { deviceFetch });
    const response = await app.inject({
      method: 'POST',
      url: '/device-operations',
      payload,
    });
    expect(response.statusCode).toBe(409);
    const failure = response.json();
    expect(failure).toMatchObject({
      code: 'OPERATION_UNCERTAIN',
      observedDevice: { state: 'on' },
    });
    expect(response.body).not.toContain('server-secret');
    expect(
      (
        await app.inject(`/conversations/${failure.conversationId}/audit`)
      ).json(),
    ).toMatchObject([{ id: failure.operationId, status: 'uncertain' }]);
    expect(
      deviceFetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
  it('persists direct operation audit through an API restart without replaying the operation', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'aura-direct-'));
    const databasePath = join(directory, 'aura.sqlite');
    const first = await setup({ DATABASE_PATH: databasePath });
    try {
      const response = await first.app.inject({
        method: 'POST',
        url: '/device-operations',
        payload: { deviceId: 'light.living_room', state: 'on' },
      });
      const result = response.json();
      await first.app.close();
      servers.splice(servers.indexOf(first), 1);
      const second = await setup({ DATABASE_PATH: databasePath });
      expect(
        (
          await second.app.inject(
            `/conversations/${result.conversationId}/audit`,
          )
        ).json(),
      ).toMatchObject([{ id: result.operationId, status: 'succeeded' }]);
      expect((await second.app.inject('/devices')).json()[0].state).toBe('off');
      await second.app.close();
      servers.splice(servers.indexOf(second), 1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
