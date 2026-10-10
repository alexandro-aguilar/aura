import { describe, expect, it, vi } from 'vitest';
import { pcmToWav, validateVoiceWav, VOICE_MAX_BYTES } from '@aura/contracts';
import { PcmVad, runVoiceTurn } from './index.js';
import { MockSpeech } from '@aura/integrations';

function pcm(seconds: number, amplitude: number) {
  const bytes = Buffer.alloc(Math.round(seconds * 16000) * 2);
  for (let i = 0; i < bytes.length; i += 2)
    bytes.writeInt16LE(Math.round(Math.sin(i * 0.1) * amplitude), i);
  return bytes;
}
describe('single-activation satellite', () => {
  it('detects end-of-speech across partial PCM frames and caps recording duration', () => {
    const vad = new PcmVad();
    const input = Buffer.concat([pcm(0.2, 0), pcm(0.4, 6000), pcm(1, 0)]);
    for (let i = 0; i < input.length; i += 127)
      vad.push(input.subarray(i, i + 127));
    expect(vad.finished).toBe(true);
    expect(() => validateVoiceWav(vad.wav())).not.toThrow();
    const continuous = new PcmVad();
    continuous.push(pcm(25, 6000));
    expect(continuous.wav().length).toBe(VOICE_MAX_BYTES);
  });
  it('does not submit silence or short noise impulses as speech', () => {
    const vad = new PcmVad();
    vad.push(Buffer.concat([pcm(0.02, 6000), pcm(8, 0)]));
    expect(vad.finished).toBe(true);
    expect(() => vad.wav()).toThrow('No speech');
  });
  it('releases capture before upload/playback and makes only one authenticated upload', async () => {
    const order: string[] = [];
    const wav = pcmToWav(new Uint8Array(32000));
    const output = await new MockSpeech().synthesize(
      'fixture',
      new AbortController().signal,
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_input, init) => {
        order.push('upload');
        expect(init?.headers).toMatchObject({
          Authorization: `Bearer ${'x'.repeat(32)}`,
        });
        expect(init?.redirect).toBe('error');
        return new Response(
          JSON.stringify({
            type: 'audio',
            audioBase64: Buffer.from(output).toString('base64'),
            mimeType: 'audio/wav',
          }) + '\n{"type":"done"}\n',
        );
      });
    await runVoiceTurn({
      url: 'http://127.0.0.1:3001',
      token: 'x'.repeat(32),
      signal: new AbortController().signal,
      capture: async () => {
        order.push('capture');
        order.push('release');
        return wav;
      },
      play: async (bytes) => {
        expect(bytes).toEqual(output);
        order.push('play');
      },
      onEvent: () => {},
      fetch: fetcher,
    });
    expect(order).toEqual(['capture', 'release', 'upload', 'play']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not retry upload after network failure or recapture after playback failure', async () => {
    const capture = vi.fn().mockResolvedValue(pcmToWav(new Uint8Array(32000)));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('Network lost'));
    const play = vi.fn();
    const options = {
      url: 'http://localhost:3001',
      token: 'x'.repeat(32),
      signal: new AbortController().signal,
      capture,
      play,
      onEvent: () => {},
      fetch: fetcher,
    };
    await expect(runVoiceTurn(options)).rejects.toThrow('Network lost');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(
      new Response(
        '{"type":"audio","audioBase64":"AAAA","mimeType":"audio/wav"}\n{"type":"done"}\n',
      ),
    );
    play.mockRejectedValue(new Error('Speaker removed'));
    await expect(runVoiceTurn(options)).rejects.toThrow('Speaker removed');
    expect(capture).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects cleartext LAN endpoints and missing credentials before microphone activation', async () => {
    const capture = vi.fn();
    for (const url of [
      'http://192.168.1.10:3001',
      'https://user:secret@aura.fixture',
      'file:///tmp/voice',
    ]) {
      await expect(
        runVoiceTurn({
          url,
          token: 'x'.repeat(32),
          signal: new AbortController().signal,
          capture,
          play: vi.fn(),
          onEvent: () => {},
        }),
      ).rejects.toThrow();
    }
    await expect(
      runVoiceTurn({
        url: 'http://localhost:3001',
        token: '',
        signal: new AbortController().signal,
        capture,
        play: vi.fn(),
        onEvent: () => {},
      }),
    ).rejects.toThrow('SATELLITE_TOKEN');
    expect(capture).not.toHaveBeenCalled();
  });
  it('discards a capture cancelled before upload', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn();
    await expect(
      runVoiceTurn({
        url: 'http://localhost:3001',
        token: 'x'.repeat(32),
        signal: controller.signal,
        capture: async () => {
          controller.abort();
          return pcmToWav(new Uint8Array(32000));
        },
        play: vi.fn(),
        onEvent: () => {},
        fetch: fetcher,
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
