import { describe, expect, it, vi } from 'vitest';
import { OpenAISpeech, MockSpeech } from './speech.js';

const config = {
  apiKey: 'fixture-only',
  transcriptionModel: 'gpt-4o-mini-transcribe-2025-12-15',
  speechModel: 'gpt-4o-mini-tts-2025-12-15',
  voice: 'coral',
  language: 'en',
  timeoutMs: 1000,
};
describe('pinned OpenAI speech adapter', () => {
  it('sends multipart WAV recognition and JSON synthesis using the installed SDK with no cloud traffic', async () => {
    const wav = await new MockSpeech().synthesize(
      'fixture',
      new AbortController().signal,
    );
    const calls: { url: string; body: string }[] = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        if (input === 'data:,') return fetch(input);
        const request = new Request(input, init);
        const body = await request.text();
        calls.push({ url: request.url, body });
        expect(request.headers.get('authorization')).toBe(
          'Bearer fixture-only',
        );
        return request.url.endsWith('/transcriptions')
          ? Response.json({ text: 'turn on living room' })
          : new Response(wav, { headers: { 'Content-Type': 'audio/wav' } });
      });
    const provider = new OpenAISpeech(config, fetcher);
    const signal = new AbortController().signal;
    expect(await provider.transcribe(new Uint8Array([1, 2]), signal)).toBe(
      'turn on living room',
    );
    expect(await provider.synthesize('Living room is on.', signal)).toEqual(
      wav,
    );
    expect(calls[0]?.body).toContain('filename="turn.wav"');
    expect(calls[0]?.body).toContain(config.transcriptionModel);
    expect(calls[0]?.body).toContain('name="language"');
    expect(calls[0]?.body).toContain('\r\nen\r\n');
    expect(calls[1]?.body).toContain('"response_format":"wav"');
    expect(calls[1]?.body).toContain(config.speechModel);
    expect(
      fetcher.mock.calls.filter(([input]) => input !== 'data:,'),
    ).toHaveLength(2);
  });
  it.each([401, 429, 500])(
    'sanitizes provider status %s and never retries',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (input) =>
          input === 'data:,'
            ? fetch(input)
            : new Response('secret', { status }),
        );
      const provider = new OpenAISpeech(config, fetcher);
      await expect(
        provider.transcribe(new Uint8Array(), new AbortController().signal),
      ).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
      expect(
        fetcher.mock.calls.filter(([input]) => input !== 'data:,'),
      ).toHaveLength(1);
    },
  );
  it('rejects invalid and oversized synthesis without leaking upstream bodies', async () => {
    for (const bytes of [
      new Uint8Array(100),
      new Uint8Array(4 * 1024 * 1024 + 1),
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(bytes));
      await expect(
        new OpenAISpeech(config, fetcher).synthesize(
          'hello',
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
      expect(
        fetcher.mock.calls.filter(([input]) => input !== 'data:,'),
      ).toHaveLength(1);
    }
  });
  it('propagates cancellation to the provider request without retry', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new OpenAISpeech(config, fetcher).transcribe(
        new Uint8Array(),
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it('bounds slow recognition and synthesis requests with aborts and no retries', async () => {
  for (const stage of ['transcribe', 'synthesize'] as const) {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        if (input === 'data:,') return fetch(input);
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('timed out')),
            { once: true },
          );
        });
      });
    const provider = new OpenAISpeech({ ...config, timeoutMs: 30 }, fetcher);
    const request =
      stage === 'transcribe'
        ? provider.transcribe(new Uint8Array(), new AbortController().signal)
        : provider.synthesize('hello', new AbortController().signal);
    await expect(request).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
    expect(
      fetcher.mock.calls.filter(([input]) => input !== 'data:,'),
    ).toHaveLength(1);
  }
});
