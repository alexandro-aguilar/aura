import { readFile } from 'node:fs/promises';
import { runVoiceTurn, captureAlsa, playAlsa } from './index.js';
import { pcmToWav } from '@aura/contracts';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
if (
  !args.includes('--once') ||
  args.some(
    (arg, index) =>
      !['--once', '--fixture', '--no-playback', '--file'].includes(arg) &&
      index !== fileIndex + 1,
  ) ||
  (fileIndex >= 0 && !args[fileIndex + 1])
) {
  console.error(
    'Usage: yarn voice:once [--fixture | --file canonical.wav] [--no-playback]',
  );
  process.exitCode = 1;
} else {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log(
    'One deliberate voice turn. Capture stops before playback. Speech playback is AI-generated; mock mode plays a tone.',
  );
  let accepted = false;
  try {
    if (args.includes('--fixture')) {
      const base = process.env.AURA_API_URL ?? 'http://127.0.0.1:3001';
      const [health, capability] = (await Promise.all([
        fetch(new URL('/health', base), {
          signal: AbortSignal.timeout(5000),
        }).then((r) => r.json()),
        fetch(new URL('/voice/capabilities', base), {
          signal: AbortSignal.timeout(5000),
        }).then((r) => r.json()),
      ])) as [{ mode: string }, { mode: string }];
      if (health.mode !== 'mock' || capability.mode !== 'mock')
        throw new Error(
          'Fixture mode requires a mock agent and mock speech; no paid requests were submitted.',
        );
    }
    await runVoiceTurn({
      url: process.env.AURA_API_URL ?? 'http://127.0.0.1:3001',
      token: process.env.SATELLITE_TOKEN ?? '',
      ...(process.env.VOICE_CONVERSATION_ID
        ? { conversationId: process.env.VOICE_CONVERSATION_ID }
        : {}),
      signal: controller.signal,
      capture: async (signal) => {
        if (args.includes('--fixture')) return pcmToWav(new Uint8Array(32000));
        if (fileIndex >= 0) {
          const { stat } = await import('node:fs/promises');
          const path = args[fileIndex + 1]!;
          if ((await stat(path)).size > 640044)
            throw new Error('Audio file exceeds 20-second limit.');
          return readFile(path);
        }
        console.log(
          'Listening for up to 20 seconds; speech ends after 0.9 seconds of silence.',
        );
        return captureAlsa(
          signal,
          process.env.ALSA_CAPTURE_DEVICE ?? 'default',
        );
      },
      play: args.includes('--no-playback')
        ? async () => {}
        : (wav, signal) =>
            playAlsa(
              wav,
              signal,
              process.env.ALSA_PLAYBACK_DEVICE ?? 'default',
            ),
      onEvent: (event) => {
        if (event.type === 'accepted') {
          accepted = true;
          console.log(`Conversation: ${event.conversationId}`);
        }
        if (event.type === 'phase') console.log(event.phase);
        if (event.type === 'transcript') console.log(`You: ${event.text}`);
        if (event.type === 'response') console.log(`Aura: ${event.message}`);
      },
    });
    console.log('Turn complete.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Voice failed.');
    console.error(
      accepted
        ? 'Inspect this conversation history, audit and device state before another turn. No automatic retry occurred.'
        : 'If the connection failed during submission, completion may be unknown. Inspect device state before retrying.',
    );
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}
