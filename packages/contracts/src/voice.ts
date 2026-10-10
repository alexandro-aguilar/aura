import { z } from 'zod';

export const VOICE_SAMPLE_RATE = 16000;
export const VOICE_MAX_SECONDS = 20;
export const VOICE_MAX_BYTES = 44 + VOICE_SAMPLE_RATE * 2 * VOICE_MAX_SECONDS;
export const VOICE_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const base64 = (max: number) =>
  z
    .string()
    .min(4)
    .max(4 * Math.ceil(max / 3))
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const voiceRequestSchema = z
  .object({
    conversationId: z.uuid().optional(),
    audioBase64: base64(VOICE_MAX_BYTES),
  })
  .strict();
export type VoiceRequest = z.infer<typeof voiceRequestSchema>;
export const voiceEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('accepted'), conversationId: z.uuid() }),
  z.object({
    type: z.literal('phase'),
    phase: z.enum(['transcribing', 'responding', 'synthesizing']),
  }),
  z.object({
    type: z.literal('transcript'),
    text: z.string().min(1).max(4000),
  }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('response'), message: z.string() }),
  z.object({
    type: z.literal('audio'),
    audioBase64: base64(VOICE_MAX_OUTPUT_BYTES),
    mimeType: z.literal('audio/wav'),
  }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type VoiceEvent = z.infer<typeof voiceEventSchema>;

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function decodeBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}
export function pcmToWav(
  pcm: Uint8Array,
  sampleRate = VOICE_SAMPLE_RATE,
): Uint8Array {
  if (pcm.length % 2) throw new Error('Expected PCM16 samples');
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const label = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i);
  };
  label(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  label(8, 'WAVE');
  label(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, 'data');
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}
// Canonical PCM WAV only: rejects compressed, inconsistent, trailing and overlong audio.
export function validateVoiceWav(wav: Uint8Array): void {
  if (wav.length < 44 + 3200 || wav.length > VOICE_MAX_BYTES || wav.length % 2)
    throw new Error(
      'Audio must contain 0.1–20 seconds of mono PCM16 at 16 kHz.',
    );
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const label = (offset: number, text: string) =>
    [...text].every((c, i) => wav[offset + i] === c.charCodeAt(0));
  if (
    !label(0, 'RIFF') ||
    !label(8, 'WAVE') ||
    !label(12, 'fmt ') ||
    !label(36, 'data') ||
    view.getUint32(4, true) !== wav.length - 8 ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== VOICE_SAMPLE_RATE ||
    view.getUint32(28, true) !== VOICE_SAMPLE_RATE * 2 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== wav.length - 44
  )
    throw new Error('Invalid WAV. Use canonical mono PCM16 at 16 kHz.');
}

// Both voice clients use the same bounded NDJSON parser. Never retries an upload.
export async function* readVoiceEvents(
  response: Response,
): AsyncGenerator<VoiceEvent> {
  if (!response.ok || !response.body)
    throw new Error(`Voice request rejected (${response.status}).`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let received = 0;
  let terminal = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > 8 * 1024 * 1024)
        throw new Error('Voice response exceeds limit.');
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        if (terminal) throw new Error('Unexpected event after completion.');
        const event = voiceEventSchema.parse(JSON.parse(line));
        terminal = event.type === 'done' || event.type === 'error';
        yield event;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim() || !terminal)
      throw new Error(
        'Voice connection ended before completion. Inspect history and audit before retrying.',
      );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
