import { spawn } from 'node:child_process';
import {
  pcmToWav,
  VOICE_SAMPLE_RATE,
  VOICE_MAX_SECONDS,
} from '@aura/contracts';

// Energy VAD for one explicitly activated turn; no wake word or background listening.
export class PcmVad {
  private pending = Buffer.alloc(0);
  private readonly frames: Buffer[] = [];
  private samples = 0;
  private voicedSamples = 0;
  private silenceSamples = 0;
  private heardSpeech = false;
  finished = false;
  constructor(private readonly threshold = 0.02) {}
  push(chunk: Uint8Array): boolean {
    if (this.finished) return true;
    this.pending = Buffer.concat([this.pending, chunk]);
    const frameBytes = 640; // 20 ms, 16 kHz PCM16 mono.
    while (this.pending.length >= frameBytes && !this.finished) {
      const frame = Buffer.from(this.pending.subarray(0, frameBytes));
      this.pending = this.pending.subarray(frameBytes);
      let energy = 0;
      for (let i = 0; i < frameBytes; i += 2)
        energy += (frame.readInt16LE(i) / 32768) ** 2;
      const speech = Math.sqrt(energy / (frameBytes / 2)) >= this.threshold;
      this.samples += frameBytes / 2;
      this.frames.push(frame);
      if (speech) {
        this.voicedSamples += frameBytes / 2;
        this.silenceSamples = 0;
      } else this.silenceSamples += frameBytes / 2;
      if (this.voicedSamples >= 0.16 * VOICE_SAMPLE_RATE)
        this.heardSpeech = true;
      if (
        (this.heardSpeech && this.silenceSamples >= 0.9 * VOICE_SAMPLE_RATE) ||
        (!this.heardSpeech && this.samples >= 8 * VOICE_SAMPLE_RATE) ||
        this.samples >= VOICE_MAX_SECONDS * VOICE_SAMPLE_RATE
      )
        this.finished = true;
    }
    // Never retain an arbitrary chunk tail after reaching the turn limit.
    if (this.finished) this.pending = Buffer.alloc(0);
    return this.finished;
  }
  wav(): Uint8Array {
    if (!this.heardSpeech)
      throw new Error('No speech detected. Activate again when ready.');
    return pcmToWav(Buffer.concat(this.frames));
  }
}

export async function captureAlsa(
  signal: AbortSignal,
  device = 'default',
): Promise<Uint8Array> {
  signal.throwIfAborted();
  const child = spawn(
    'arecord',
    ['-q', '-D', device, '-t', 'raw', '-f', 'S16_LE', '-r', '16000', '-c', '1'],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const vad = new PcmVad();
  return new Promise((resolve, reject) => {
    let stopped = false;
    let failure: Error | undefined;
    let force: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      child.kill('SIGTERM');
      force = setTimeout(() => child.kill('SIGKILL'), 2000);
    };
    const abort = () => {
      failure = new Error('Capture cancelled.');
      stop();
    };
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => {
      failure = new Error('Microphone timed out.');
      stop();
    }, 22000);
    child.stdout.on('data', (chunk: Buffer) => {
      if (!stopped && vad.push(chunk)) stop();
    });
    child.stdout.on('error', () => {
      failure = new Error('Microphone transport failed.');
      stop();
    });
    child.on('error', () => {
      failure = new Error(
        'Could not start arecord. Install alsa-utils and check the microphone.',
      );
    });
    child.on('close', (code, exitSignal) => {
      clearTimeout(timeout);
      clearTimeout(force);
      signal.removeEventListener('abort', abort);
      if (failure) {
        reject(failure);
        return;
      }
      if (
        !stopped ||
        !vad.finished ||
        exitSignal === 'SIGKILL' ||
        (code !== null && code !== 0 && code !== 1)
      ) {
        reject(
          new Error('Microphone stopped unexpectedly. No audio submitted.'),
        );
        return;
      }
      try {
        resolve(vad.wav());
      } catch (error) {
        reject(error);
      }
    });
    if (signal.aborted) abort();
  });
}

export async function playAlsa(
  wav: Uint8Array,
  signal: AbortSignal,
  device = 'default',
): Promise<void> {
  signal.throwIfAborted();
  const child = spawn('aplay', ['-q', '-D', device, '-t', 'wav'], {
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  return new Promise((resolve, reject) => {
    let failure: Error | undefined;
    let force: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      failure = new Error(
        'Playback stopped. The submitted turn remains saved.',
      );
      child.kill('SIGTERM');
      force ??= setTimeout(() => child.kill('SIGKILL'), 2000);
    };
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 120000);
    child.on('error', () => {
      failure = new Error('Could not start aplay. The text response is saved.');
    });
    child.stdin.on('error', () => {
      failure = new Error(
        'Speaker playback failed. The text response is saved.',
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(force);
      signal.removeEventListener('abort', abort);
      if (failure || code !== 0)
        reject(
          failure ?? new Error('Playback failed. The text response is saved.'),
        );
      else resolve();
    });
    child.stdin.end(wav);
    if (signal.aborted) abort();
  });
}
