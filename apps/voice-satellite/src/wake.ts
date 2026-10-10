import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
export interface WakeEngine {
  frameLength: number;
  sampleRate: number;
  process(frame: Int16Array): number;
  release(): void;
}
export async function createWakeEngine(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WakeEngine> {
  if (env.WAKE_ENABLED !== 'true')
    throw new Error('Set WAKE_ENABLED=true explicitly to use wake listening.');
  if (!env.PICOVOICE_ACCESS_KEY?.trim())
    throw new Error(
      'Configure your own PICOVOICE_ACCESS_KEY in .env.voice-satellite.',
    );
  for (const key of ['WAKE_KEYWORD_PATH', 'WAKE_MODEL_PATH'])
    if (env[key] && !isAbsolute(env[key]!))
      throw new Error(`${key} must be an absolute path.`);
  const sensitivity = Number(env.WAKE_SENSITIVITY ?? '0.5');
  if (!Number.isFinite(sensitivity) || sensitivity < 0 || sensitivity > 1)
    throw new Error('WAKE_SENSITIVITY must be 0–1.');
  const { Porcupine, BuiltinKeyword, getBuiltinKeywordPath } =
    await import('@picovoice/porcupine-node');
  return new Porcupine(
    env.PICOVOICE_ACCESS_KEY,
    [env.WAKE_KEYWORD_PATH || getBuiltinKeywordPath(BuiltinKeyword.PORCUPINE)],
    [sensitivity],
    env.WAKE_MODEL_PATH ? { modelPath: env.WAKE_MODEL_PATH } : {},
  );
}
// Streaming framing retains at most one partial frame; no rolling microphone recording.
export class WakeFrames {
  private pending = Buffer.alloc(0);
  constructor(private readonly engine: WakeEngine) {
    if (
      engine.sampleRate !== 16000 ||
      !Number.isInteger(engine.frameLength) ||
      engine.frameLength < 1 ||
      engine.frameLength > 16000
    )
      throw new Error('Unsupported wake engine audio format.');
  }
  push(chunk: Uint8Array): boolean {
    const bytes = this.engine.frameLength * 2;
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(bytes - this.pending.length, chunk.length - offset);
      this.pending = Buffer.concat([
        this.pending,
        chunk.subarray(offset, offset + take),
      ]);
      offset += take;
      if (this.pending.length === bytes) {
        const frame = new Int16Array(this.engine.frameLength);
        for (let i = 0; i < frame.length; i++)
          frame[i] = this.pending.readInt16LE(i * 2);
        this.pending = Buffer.alloc(0);
        if (this.engine.process(frame) >= 0) return true;
      }
    }
    return false;
  }
}
export async function waitForWake(
  engine: WakeEngine,
  signal: AbortSignal,
  device = 'default',
): Promise<void> {
  signal.throwIfAborted();
  const frames = new WakeFrames(engine);
  const child = spawn(
    'arecord',
    ['-q', '-D', device, '-t', 'raw', '-f', 'S16_LE', '-r', '16000', '-c', '1'],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return new Promise((resolve, reject) => {
    let detected = false;
    let failure: Error | undefined;
    let stopped = false;
    let force: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      child.kill('SIGTERM');
      force = setTimeout(() => child.kill('SIGKILL'), 2000);
    };
    const abort = () => {
      failure = new Error('Wake listening cancelled.');
      stop();
    };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (stopped) return;
      try {
        if (frames.push(chunk)) {
          detected = true;
          stop();
        }
      } catch {
        failure = new Error('Wake engine failed.');
        stop();
      }
    });
    child.stdout.on('error', () => {
      failure = new Error('Wake microphone transport failed.');
      stop();
    });
    child.on('error', () => {
      failure = new Error(
        'Could not start wake microphone. Check alsa-utils and capture device.',
      );
    });
    child.on('close', (code, exitSignal) => {
      clearTimeout(force);
      signal.removeEventListener('abort', abort);
      if (
        failure ||
        !detected ||
        exitSignal === 'SIGKILL' ||
        (code !== null && code !== 0 && code !== 1)
      )
        reject(failure ?? new Error('Wake microphone stopped unexpectedly.'));
      else resolve();
    });
    if (signal.aborted) abort();
  });
}
export type WakeState = 'muted' | 'muting' | 'listening' | 'activated' | 'turn';
export class WakeSession {
  private controller: AbortController | undefined;
  private pending: Promise<void> | undefined;
  constructor(
    private readonly io: {
      wait(signal: AbortSignal): Promise<void>;
      feedback(signal: AbortSignal): Promise<void>;
      turn(signal: AbortSignal): Promise<void>;
      state(state: WakeState): void;
      error(): void;
    },
  ) {
    io.state('muted');
  }
  unmute() {
    if (this.pending) return;
    const controller = new AbortController();
    this.controller = controller;
    this.pending = (async () => {
      while (!controller.signal.aborted) {
        this.io.state('listening');
        await this.io.wait(controller.signal);
        controller.signal.throwIfAborted();
        this.io.state('activated');
        await this.io.feedback(controller.signal);
        controller.signal.throwIfAborted();
        this.io.state('turn');
        await this.io.turn(controller.signal);
      }
    })()
      .catch(() => {
        if (!controller.signal.aborted) this.io.error();
      })
      .finally(() => {
        this.controller = undefined;
        this.pending = undefined;
        this.io.state('muted');
      });
  }
  mute() {
    if (this.controller) {
      this.io.state('muting');
      this.controller.abort();
    }
  }
  async idle() {
    await this.pending;
  }
}
