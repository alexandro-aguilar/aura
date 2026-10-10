import OpenAI, { toFile } from 'openai';
import type { SpeechToText, TextToSpeech } from '@aura/domain';
import { SpeechError } from '@aura/domain';

export class MockSpeech implements SpeechToText, TextToSpeech {
  constructor(private readonly transcript = 'status') {}
  async transcribe(_wav: Uint8Array, signal: AbortSignal) {
    signal.throwIfAborted();
    return this.transcript;
  }
  async synthesize(_text: string, signal: AbortSignal) {
    signal.throwIfAborted();
    // A short acknowledgement tone, deliberately not represented as real speech.
    const rate = 24000;
    const wav = new Uint8Array(44 + rate / 2);
    const view = new DataView(wav.buffer);
    const label = (offset: number, text: string) =>
      [...text].forEach((c, i) => {
        wav[offset + i] = c.charCodeAt(0);
      });
    label(0, 'RIFF');
    view.setUint32(4, wav.length - 8, true);
    label(8, 'WAVE');
    label(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    label(36, 'data');
    view.setUint32(40, wav.length - 44, true);
    for (let i = 0; i < rate / 4; i++)
      view.setInt16(
        44 + i * 2,
        Math.round(Math.sin((i * 2 * Math.PI * 440) / rate) * 2000),
        true,
      );
    return wav;
  }
}

export class OpenAISpeech implements SpeechToText, TextToSpeech {
  private readonly client: OpenAI;
  constructor(
    private readonly config: {
      apiKey: string;
      transcriptionModel: string;
      speechModel: string;
      voice: string;
      language: string;
      timeoutMs: number;
    },
    fetch?: typeof globalThis.fetch,
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: config.timeoutMs,
      ...(fetch ? { fetch } : {}),
    });
  }
  async transcribe(wav: Uint8Array, signal: AbortSignal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const bounded = AbortSignal.any([signal, controller.signal]);
    try {
      bounded.throwIfAborted();
      const result = await this.client.audio.transcriptions.create(
        {
          model: this.config.transcriptionModel,
          file: await toFile(wav, 'turn.wav', { type: 'audio/wav' }),
          language: this.config.language,
          response_format: 'json',
        },
        { signal: bounded },
      );
      if (typeof result.text !== 'string')
        throw new Error('Invalid transcription');
      return result.text;
    } catch {
      throw new SpeechError(
        'SPEECH_UNAVAILABLE',
        'Speech recognition failed. No chat turn was submitted.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async synthesize(text: string, signal: AbortSignal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const bounded = AbortSignal.any([signal, controller.signal]);
    try {
      const response = await this.client.audio.speech.create(
        {
          model: this.config.speechModel,
          voice: this.config.voice,
          input: text,
          response_format: 'wav',
        },
        { signal: bounded },
      );
      if (!response.body) throw new Error('Missing speech');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 4 * 1024 * 1024) throw new Error('Speech exceeds limit');
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const wav = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        wav.set(chunk, offset);
        offset += chunk.length;
      }
      if (
        length < 44 ||
        new TextDecoder().decode(wav.subarray(0, 4)) !== 'RIFF' ||
        new TextDecoder().decode(wav.subarray(8, 12)) !== 'WAVE'
      )
        throw new Error('Invalid speech');
      return wav;
    } catch {
      throw new SpeechError(
        'SPEECH_UNAVAILABLE',
        'Audio playback is unavailable. The text response is saved; inspect history and audit before retrying.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
