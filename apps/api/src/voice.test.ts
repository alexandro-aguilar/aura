import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SpeechError } from '@aura/domain';
import { MockSpeech } from '@aura/integrations';
import {
  pcmToWav,
  encodeBase64,
  voiceEventSchema,
  readVoiceEvents,
} from '@aura/contracts';
import type { VoiceEvent } from '@aura/contracts';
import { buildServer } from './server.js';
import { readConfig } from './config.js';

const origin = 'http://localhost:5173';
const token = 'fixture-'.repeat(5);
const payload = { audioBase64: encodeBase64(pcmToWav(new Uint8Array(32000))) };
const servers: Awaited<ReturnType<typeof buildServer>>[] = [];
async function setup(options: Parameters<typeof buildServer>[1] = {}) {
  const result = await buildServer(
    readConfig({ DATABASE_PATH: ':memory:', SATELLITE_TOKEN: token }),
    { logger: false, ...options },
  );
  servers.push(result);
  return result;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(({ app }) => app.close()));
});
function events(body: string) {
  return body
    .trim()
    .split('\n')
    .map((line) => voiceEventSchema.parse(JSON.parse(line)));
}
function idOf(items: VoiceEvent[]) {
  const first = items[0];
  if (first?.type !== 'accepted') throw new Error('Missing accepted');
  return first.conversationId;
}
function post(
  app: Awaited<ReturnType<typeof buildServer>>['app'],
  input: unknown = payload,
) {
  return app.inject({
    method: 'POST',
    url: '/voice/turn',
    headers: { origin, 'Content-Type': 'application/json' },
    payload: JSON.stringify(input),
  });
}

describe('deliberate voice API', () => {
  it('runs recognition → authorized mock tool → persisted chat/audit → speech with ordered phases', async () => {
    const { app, persistence, devices } = await setup({
      speech: new MockSpeech('turn on living room'),
    });
    const response = await post(app);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const items = events(response.body);
    const id = idOf(items);
    expect(items.filter((event) => event.type === 'phase')).toEqual([
      { type: 'phase', phase: 'transcribing' },
      { type: 'phase', phase: 'responding' },
      { type: 'phase', phase: 'synthesizing' },
    ]);
    expect(items.at(-1)).toEqual({ type: 'done' });
    expect(items.find((event) => event.type === 'audio')).toMatchObject({
      mimeType: 'audio/wav',
    });
    expect(
      persistence.conversations.messages(id).map((m) => m.content),
    ).toEqual(['turn on living room', 'Living room light is on (mock).']);
    expect(persistence.audit.list(id)).toMatchObject([{ status: 'succeeded' }]);
    expect((await devices.list())[0]?.state).toBe('on');
    expect(
      events((await post(app, { ...payload, conversationId: id })).body)[0],
    ).toEqual({ type: 'accepted', conversationId: id });
  });
  it('requires the exact browser origin or scoped satellite credential and rejects foreign origins', async () => {
    const { app } = await setup();
    for (const headers of [
      {},
      { authorization: 'Bearer bad' },
      { authorization: `Bearer ${'é'.repeat(token.length)}` },
      { origin: 'http://evil.example', authorization: `Bearer ${token}` },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/voice/turn',
        headers,
        payload,
      });
      expect([401, 403]).toContain(response.statusCode);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/voice/turn',
          headers: { authorization: `Bearer ${token}` },
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject('/voice/capabilities')).body).not.toContain(token);
  });
  it('rejects corrupt, inconsistent, overlong, noncanonical and oversized audio before recognition', async () => {
    const speech = new MockSpeech();
    const transcribe = vi.spyOn(speech, 'transcribe');
    const { app } = await setup({ speech });
    const wrongRate = pcmToWav(new Uint8Array(32000), 24000);
    const badLength = pcmToWav(new Uint8Array(32000));
    badLength[40] = 1;
    for (const input of [
      { audioBase64: '!!!!' },
      { ...payload, grants: ['light.any'] },
      { audioBase64: encodeBase64(new Uint8Array(4000)) },
      { audioBase64: encodeBase64(wrongRate) },
      { audioBase64: encodeBase64(badLength) },
      { audioBase64: encodeBase64(pcmToWav(new Uint8Array(640002))) },
    ])
      expect((await post(app, input)).statusCode).toBe(400);
    const large = await post(app, { audioBase64: 'A'.repeat(900000) });
    expect(large.statusCode).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
    expect(
      (await post(app, { ...payload, conversationId: randomUUID() }))
        .statusCode,
    ).toBe(404);
  });
  it('never reaches chat for empty recognition or provider failure, then recovers on a new deliberate turn', async () => {
    const speech = new MockSpeech();
    vi.spyOn(speech, 'transcribe')
      .mockResolvedValueOnce(' ')
      .mockRejectedValueOnce(
        new SpeechError('SPEECH_UNAVAILABLE', 'Recognition unavailable.'),
      )
      .mockResolvedValue('status');
    const { app, persistence } = await setup({ speech });
    for (const code of ['EMPTY_TRANSCRIPT', 'SPEECH_UNAVAILABLE']) {
      const items = events((await post(app)).body);
      expect(items.at(-1)).toMatchObject({ type: 'error', code });
      expect(persistence.conversations.messages(idOf(items))).toEqual([]);
    }
    expect(events((await post(app)).body).at(-1)).toEqual({ type: 'done' });
  });
  it('preserves completed device operation and text when TTS fails without replaying the tool', async () => {
    const speech = new MockSpeech('turn on living room');
    vi.spyOn(speech, 'synthesize').mockRejectedValue(
      new Error('private-vendor-response'),
    );
    const { app, persistence } = await setup({ speech });
    const response = await post(app);
    const items = events(response.body);
    const id = idOf(items);
    expect(response.body).not.toContain('private-vendor-response');
    expect(items.find((event) => event.type === 'response')).toBeDefined();
    expect(items.at(-1)?.type).toBe('error');
    expect(persistence.conversations.messages(id)).toHaveLength(2);
    expect(persistence.audit.list(id)).toMatchObject([{ status: 'succeeded' }]);
  });
  it('audits denied spoken writes without dispatching or synthesizing a reply', async () => {
    const speech = new MockSpeech('turn on light.ungranted');
    const synthesize = vi.spyOn(speech, 'synthesize');
    const { app, persistence, devices } = await setup({ speech });
    const items = events((await post(app)).body);
    expect(items.at(-1)).toMatchObject({ type: 'error', code: 'FORBIDDEN' });
    expect(persistence.audit.list(idOf(items))).toMatchObject([
      { deviceId: 'light.ungranted', status: 'denied' },
    ]);
    expect(synthesize).not.toHaveBeenCalled();
    expect((await devices.list())[0]?.state).toBe('off');
  });
  it('keeps spoken commands on the same read-only Home Assistant boundary', async () => {
    const server = await buildServer(
      readConfig({
        DATABASE_PATH: ':memory:',
        DEVICE_BACKEND: 'home-assistant',
        HA_URL: 'http://ha.fixture',
        HA_TOKEN: 'fixture',
        HA_LIGHT_IDS: 'light.test',
      }),
      {
        logger: false,
        speech: new MockSpeech('turn on light.test'),
        deviceFetch: vi.fn(),
      },
    );
    servers.push(server);
    const items = events((await post(server.app)).body);
    const response = items.find((event) => event.type === 'response');
    expect(response).toMatchObject({
      message: expect.stringContaining('read-only'),
    });
    expect(server.persistence.audit.list(idOf(items))).toEqual([]);
  });
  it('drains a chat after HTTP disconnect, persists its audit and skips playback generation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const speech = new MockSpeech();
    const synthesize = vi.spyOn(speech, 'synthesize');
    const { app, persistence } = await setup({
      speech,
      agent: {
        stream: async function* () {
          await gate;
          yield 'Saved after disconnect.';
        },
      },
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const controller = new AbortController();
    try {
      const response = await fetch(`${app.listeningOrigin}/voice/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const received: VoiceEvent[] = [];
      for await (const event of readVoiceEvents(response)) {
        received.push(event);
        if (event.type === 'phase' && event.phase === 'responding') break;
      }
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 30));
      release();
      const id = idOf(received);
      await expect
        .poll(() => persistence.conversations.messages(id).length)
        .toBe(2);
      expect(synthesize).not.toHaveBeenCalled();
    } finally {
      release();
      controller.abort();
    }
  });
  it('rejects excess concurrent uploads before recognition and releases capacity afterward', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const speech = new MockSpeech();
    const transcribe = vi
      .spyOn(speech, 'transcribe')
      .mockImplementation(async () => {
        await gate;
        return 'status';
      });
    const { app } = await setup({ speech });
    const first = post(app);
    const second = post(app);
    // Explicitly start light-my-request promises before inspecting the third request.
    const requests = Promise.all([first, second]);
    await expect.poll(() => transcribe.mock.calls.length).toBe(2);
    try {
      expect((await post(app)).statusCode).toBe(429);
      expect(transcribe).toHaveBeenCalledTimes(2);
    } finally {
      release();
    }
    await requests;
    expect((await post(app)).statusCode).toBe(200);
  });
  it('cancels recognition before chat on disconnect', async () => {
    const speech = new MockSpeech();
    let recognize!: () => void;
    const recognition = new Promise<void>((resolve) => {
      recognize = resolve;
    });
    vi.spyOn(speech, 'transcribe').mockImplementation(async (_wav, signal) => {
      recognize();
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      return 'turn on living room';
    });
    const { app, persistence } = await setup({ speech });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const controller = new AbortController();
    const response = await fetch(`${app.listeningOrigin}/voice/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    await recognition;
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    const id = idOf(events(first));
    controller.abort();
    await reader.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(persistence.conversations.messages(id)).toEqual([]);
    expect(persistence.audit.list(id)).toEqual([]);
  });
});
