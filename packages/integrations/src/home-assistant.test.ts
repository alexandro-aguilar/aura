import { describe, expect, it, vi } from 'vitest';
import { HomeAssistantDeviceGateway } from './home-assistant.js';

const config = {
  url: 'http://ha.fixture:8123',
  token: 'server-only-fixture-token',
  lightIds: ['light.kitchen'],
  timeoutMs: 5000,
};
function state(id: string, value: string) {
  return {
    entity_id: id,
    state: value,
    attributes: { friendly_name: 'Kitchen' },
    ignored: 'not forwarded',
  };
}

describe('read-only Home Assistant gateway', () => {
  it('reads only allowed entities, maps all light states, and does not retain stale responses', async () => {
    const lightIds = [
      'light.on',
      'light.off',
      'light.unavailable',
      'light.unknown',
      'light.missing',
    ];
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (input, init) => {
        expect(init).toMatchObject({
          method: 'GET',
          redirect: 'error',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${config.token}` },
        });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        const id = new URL(input.toString()).pathname.split('/').at(-1)!;
        expect(lightIds).toContain(id);
        return id === 'light.missing'
          ? new Response(null, { status: 404 })
          : Response.json(state(id, id.slice(6)));
      });
    const gateway = new HomeAssistantDeviceGateway(
      { ...config, lightIds },
      fetch,
    );
    const devices = await gateway.list();
    expect(devices.map((d) => d.state)).toEqual([
      'on',
      'off',
      'unavailable',
      'unknown',
      'unavailable',
    ]);
    expect(devices.every((d) => !Number.isNaN(Date.parse(d.observedAt!)))).toBe(
      true,
    );
    expect(devices[0]).not.toHaveProperty('ignored');
    expect(fetch).toHaveBeenCalledTimes(5);
    fetch.mockResolvedValue(Response.json(state('light.kitchen', 'off')));
    const single = new HomeAssistantDeviceGateway(config, fetch);
    expect((await single.list())[0]?.state).toBe('off');
    fetch.mockResolvedValue(Response.json(state('light.kitchen', 'on')));
    expect((await single.list())[0]?.state).toBe('on');
  });
  it.each([401, 403, 500])(
    'sanitizes upstream HTTP %i without retrying',
    async (status) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response(config.token, { status }));
      const gateway = new HomeAssistantDeviceGateway(config, fetch);
      await expect(gateway.list()).rejects.toMatchObject({
        code: status === 500 ? 'DEVICE_UNAVAILABLE' : 'DEVICE_AUTH_FAILED',
      });
      await expect(gateway.list()).rejects.not.toThrow(config.token);
      expect(fetch).toHaveBeenCalledTimes(2); // One call per explicit refresh, no automatic retry.
    },
  );
  it.each([
    {},
    state('light.other', 'on'),
    state('light.kitchen', 'not-a-light-state'),
    {
      entity_id: 'light.kitchen',
      state: 'on',
      attributes: { friendly_name: {} },
    },
  ])('rejects malformed or mismatched state payloads: %j', async (payload) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(payload));
    await expect(
      new HomeAssistantDeviceGateway(config, fetch).list(),
    ).rejects.toMatchObject({ code: 'DEVICE_RESPONSE_INVALID' });
  });
  it('rejects non-JSON and transport failures without leaking response details', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('not JSON'))
      .mockRejectedValueOnce(new Error(config.token));
    const gateway = new HomeAssistantDeviceGateway(config, fetch);
    await expect(gateway.list()).rejects.toMatchObject({
      code: 'DEVICE_RESPONSE_INVALID',
    });
    await expect(gateway.list()).rejects.toMatchObject({
      code: 'DEVICE_UNAVAILABLE',
    });
  });
  it('bounds a read with an abort signal and never retries it', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    await expect(
      new HomeAssistantDeviceGateway(
        { ...config, timeoutMs: 10 },
        fetch,
      ).list(),
    ).rejects.toMatchObject({ code: 'DEVICE_UNAVAILABLE' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects every write before making a network request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const gateway = new HomeAssistantDeviceGateway(config, fetch);
    await expect(
      gateway.setLight({ deviceId: 'light.kitchen', state: 'on' }),
    ).rejects.toMatchObject({ code: 'READ_ONLY' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('authorized Home Assistant light writes', () => {
  const writable = {
    ...config,
    writeLightIds: ['light.kitchen'],
    confirmationTimeoutMs: 20,
  };
  it('sends only the narrow light service once and confirms through a fresh read', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(state('light.kitchen', 'off')))
      .mockResolvedValueOnce(
        Response.json([{ entity_id: 'light.unrelated', state: 'on' }]),
      )
      .mockResolvedValueOnce(Response.json(state('light.kitchen', 'on')));
    const result = await new HomeAssistantDeviceGateway(
      writable,
      fetch,
    ).setLight({ deviceId: 'light.kitchen', state: 'on' });
    expect(result).toMatchObject({
      id: 'light.kitchen',
      state: 'on',
      canControl: true,
    });
    expect(
      fetch.mock.calls.map(
        ([url, init]) => `${init?.method} ${new URL(url.toString()).pathname}`,
      ),
    ).toEqual([
      'GET /api/states/light.kitchen',
      'POST /api/services/light/turn_on',
      'GET /api/states/light.kitchen',
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      entity_id: 'light.kitchen',
    });
  });
  it('allows only granted lights and on/off operations before any network access', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const gateway = new HomeAssistantDeviceGateway(writable, fetch);
    for (const operation of [
      { deviceId: 'light.other', state: 'on' },
      { deviceId: 'light.kitchen', state: 'toggle' },
      { deviceId: 'lock.door', state: 'on' },
    ]) {
      await expect(
        gateway.setLight(operation as { deviceId: string; state: 'on' }),
      ).rejects.toMatchObject({ code: 'DEVICE_NOT_ALLOWED' });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['unavailable', 'unknown'])(
    'refuses an %s entity before dispatch',
    async (value) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(Response.json(state('light.kitchen', value)));
      await expect(
        new HomeAssistantDeviceGateway(writable, fetch).setLight({
          deviceId: 'light.kitchen',
          state: 'on',
        }),
      ).rejects.toMatchObject({ code: 'DEVICE_NOT_READY' });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('reconciles a transport failure without repeating the physical request', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(state('light.kitchen', 'off')))
      .mockRejectedValueOnce(new Error('connection lost after dispatch'))
      .mockResolvedValueOnce(Response.json(state('light.kitchen', 'on')));
    await expect(
      new HomeAssistantDeviceGateway(writable, fetch).setLight({
        deviceId: 'light.kitchen',
        state: 'on',
      }),
    ).rejects.toMatchObject({
      code: 'OPERATION_UNCERTAIN',
      observedDevice: { state: 'on' },
    });
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
  it('records unconfirmed observed state rather than trusting a 200 service response', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (_url, init) =>
        init?.method === 'POST'
          ? Response.json([{ entity_id: 'light.kitchen', state: 'on' }])
          : Response.json(state('light.kitchen', 'off')),
      );
    await expect(
      new HomeAssistantDeviceGateway(writable, fetch).setLight({
        deviceId: 'light.kitchen',
        state: 'on',
      }),
    ).rejects.toMatchObject({
      code: 'OPERATION_UNCERTAIN',
      observedDevice: { state: 'off' },
    });
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
  it.each([400, 401, 403, 404])(
    'reports definite service rejection %i without retry',
    async (status) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json(state('light.kitchen', 'off')))
        .mockResolvedValueOnce(new Response(config.token, { status }));
      await expect(
        new HomeAssistantDeviceGateway(writable, fetch).setLight({
          deviceId: 'light.kitchen',
          state: 'off',
        }),
      ).rejects.toMatchObject({
        code: [401, 403].includes(status)
          ? 'DEVICE_AUTH_FAILED'
          : 'DEVICE_NOT_READY',
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it('treats a service 500 and failed reconciliation as uncertain', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(state('light.kitchen', 'off')))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockRejectedValueOnce(new Error('offline'));
    await expect(
      new HomeAssistantDeviceGateway(writable, fetch).setLight({
        deviceId: 'light.kitchen',
        state: 'on',
      }),
    ).rejects.toMatchObject({
      code: 'OPERATION_UNCERTAIN',
      observedDevice: undefined,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('waits for delayed state propagation using reads only', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(state('light.kitchen', 'off')))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json(state('light.kitchen', 'off')))
      .mockResolvedValueOnce(Response.json(state('light.kitchen', 'on')));
    await expect(
      new HomeAssistantDeviceGateway(
        { ...writable, confirmationTimeoutMs: 1000 },
        fetch,
      ).setLight({ deviceId: 'light.kitchen', state: 'on' }),
    ).resolves.toMatchObject({ state: 'on' });
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
});
