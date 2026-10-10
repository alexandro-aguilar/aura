import {
  encodeBase64,
  decodeBase64,
  validateVoiceWav,
  readVoiceEvents,
} from '@aura/contracts';
import type { VoiceEvent } from '@aura/contracts';
export { captureAlsa, playAlsa, PcmVad } from './linux-audio.js';

export async function runVoiceTurn(options: {
  url: string;
  token: string;
  conversationId?: string;
  signal: AbortSignal;
  capture(signal: AbortSignal): Promise<Uint8Array>;
  play(wav: Uint8Array, signal: AbortSignal): Promise<void>;
  onEvent(event: VoiceEvent): void;
  fetch?: typeof globalThis.fetch;
}) {
  const url = new URL(options.url);
  if (
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(
      'Use an HTTPS API origin or localhost HTTP through an SSH tunnel.',
    );
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(options.token))
    throw new Error('Configure SATELLITE_TOKEN before capture.');
  // Capture must fully release the microphone before resolving, preventing self-capture.
  const wav = await options.capture(options.signal);
  options.signal.throwIfAborted();
  validateVoiceWav(wav);
  const response = await (options.fetch ?? fetch)(new URL('/voice/turn', url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify({
      audioBase64: encodeBase64(wav),
      ...(options.conversationId
        ? { conversationId: options.conversationId }
        : {}),
    }),
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(180000)]),
    redirect: 'error',
  });
  let audio: Uint8Array | undefined;
  for await (const event of readVoiceEvents(response)) {
    options.onEvent(event);
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'audio') audio = decodeBase64(event.audioBase64);
  }
  if (!audio)
    throw new Error(
      'No playback audio received. Inspect saved text before retrying.',
    );
  options.signal.throwIfAborted();
  await options.play(audio, options.signal);
}
