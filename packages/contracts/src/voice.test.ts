import { describe, expect, it } from 'vitest';
import {
  pcmToWav,
  validateVoiceWav,
  encodeBase64,
  decodeBase64,
  readVoiceEvents,
  VOICE_MAX_BYTES,
} from './voice.js';

describe('bounded audio contracts', () => {
  it('round trips a maximum-duration canonical WAV without Node-only transport helpers', () => {
    const pcm = Uint8Array.from({ length: 640000 }, (_, i) => i % 256);
    const wav = pcmToWav(pcm);
    expect(wav.length).toBe(VOICE_MAX_BYTES);
    expect(() => validateVoiceWav(wav)).not.toThrow();
    expect(decodeBase64(encodeBase64(wav))).toEqual(wav);
  });
  it('rejects truncated, stereo and trailing-byte files despite plausible headers', () => {
    const wav = pcmToWav(new Uint8Array(32000));
    for (const broken of [
      wav.subarray(0, 40),
      wav.subarray(0, wav.length - 2),
      new Uint8Array([...wav, 0, 0]),
    ])
      expect(() => validateVoiceWav(broken)).toThrow();
    wav[22] = 2;
    expect(() => validateVoiceWav(wav)).toThrow();
  });
  it('parses NDJSON across arbitrary byte boundaries, including multibyte transcripts', async () => {
    const bytes = new TextEncoder().encode(
      '{"type":"transcript","text":"lámpara"}\n{"type":"done"}\n',
    );
    const response = new Response(
      new ReadableStream({
        start(c) {
          for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
          c.close();
        },
      }),
    );
    const result = [];
    for await (const event of readVoiceEvents(response)) result.push(event);
    expect(result).toEqual([
      { type: 'transcript', text: 'lámpara' },
      { type: 'done' },
    ]);
  });
  it.each([
    '{"type":"phase","phase":"transcribing"}\n',
    '{"type":"done"}',
    '{"type":"done"}\n{"type":"done"}\n',
    'not-json\n',
  ])('rejects incomplete or invalid voice streams: %s', async (body) => {
    const run = async () => {
      for await (const _event of readVoiceEvents(new Response(body))) {
        /* drain */
      }
    };
    await expect(run()).rejects.toThrow();
  });
});
