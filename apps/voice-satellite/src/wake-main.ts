import { createInterface } from 'node:readline';
import { pcmToWav } from '@aura/contracts';
import { captureAlsa, playAlsa, runVoiceTurn } from './index.js';
import { createWakeEngine, WakeSession, waitForWake } from './wake.js';

async function main() {
  const url = new URL(process.env.AURA_API_URL ?? 'http://127.0.0.1:3001');
  if (
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Configure an HTTPS API origin or a localhost SSH tunnel.');
  const token = process.env.SATELLITE_TOKEN ?? '';
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token))
    throw new Error('Configure SATELLITE_TOKEN before wake listening.');
  const engine = await createWakeEngine();
  const captureDevice = process.env.ALSA_CAPTURE_DEVICE ?? 'default';
  const playbackDevice = process.env.ALSA_PLAYBACK_DEVICE ?? 'default';
  const tone = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++)
    tone.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 880) / 16000) * 4000),
      i * 2,
    );
  const session = new WakeSession({
    wait: (signal) => waitForWake(engine, signal, captureDevice),
    feedback: (signal) => playAlsa(pcmToWav(tone), signal, playbackDevice),
    turn: (signal) =>
      runVoiceTurn({
        url: url.origin,
        token,
        signal,
        capture: (signal) => captureAlsa(signal, captureDevice),
        play: (wav, signal) => playAlsa(wav, signal, playbackDevice),
        onEvent: (event) => {
          if (event.type === 'accepted')
            console.log(`Conversation: ${event.conversationId}`);
          if (event.type === 'phase') console.log(event.phase);
        },
      }),
    state: (state) => console.log(`Microphone: ${state}`),
    error: () =>
      console.error(
        'Wake/voice failed. Muted without retry. Inspect conversation history, audit and device state before unmuting.',
      ),
  });
  console.log(
    'Starts muted. Enter u to unmute, m to mute, q to quit. Say “Porcupine” (or your custom keyword), wait for the beep, then speak. AI-generated response playback. No microphone capture during feedback or playback.',
  );
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let shuttingDown = false;
  const stop = () => {
    shuttingDown = true;
    session.mute();
    terminal.close();
  };
  terminal.on('line', (line) => {
    if (shuttingDown) return;
    if (line.trim() === 'u') session.unmute();
    else if (line.trim() === 'm') session.mute();
    else if (line.trim() === 'q') stop();
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await new Promise<void>((resolve) => terminal.once('close', resolve));
  shuttingDown = true;
  session.mute();
  await session.idle();
  engine.release();
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
}
void main().catch(() => {
  console.error(
    'Wake startup failed. Check wake configuration, AccessKey entitlement, models and audio devices. No microphone was opened.',
  );
  process.exitCode = 1;
});
