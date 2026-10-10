import { describe, expect, it, vi } from 'vitest';
import { createWakeEngine, WakeFrames, WakeSession } from './wake.js';
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
describe('local wake boundary', () => {
  it('is opt-in and requires a private AccessKey before importing/initializing the engine', async () => {
    await expect(createWakeEngine({})).rejects.toThrow('WAKE_ENABLED');
    await expect(createWakeEngine({ WAKE_ENABLED: 'true' })).rejects.toThrow(
      'PICOVOICE_ACCESS_KEY',
    );
  });
  it('frames fragmented PCM without retaining the recording and stops on detection', () => {
    const process = vi.fn().mockReturnValueOnce(-1).mockReturnValueOnce(0);
    const frames = new WakeFrames({
      frameLength: 2,
      sampleRate: 16000,
      process,
      release() {},
    });
    expect(frames.push(new Uint8Array([1]))).toBe(false);
    expect(frames.push(new Uint8Array([0, 2, 0, 3, 0, 4, 0, 9, 9]))).toBe(true);
    expect([...process.mock.calls[0]![0]]).toEqual([1, 2]);
    expect(process).toHaveBeenCalledTimes(2);
  });
  it('starts muted, performs no turn before wake, mute aborts listening and failure does not retry', async () => {
    const turn = vi.fn();
    const feedback = vi.fn();
    const states: string[] = [];
    const wait = vi.fn(
      (signal: AbortSignal) =>
        new Promise<void>((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('abort')), {
            once: true,
          }),
        ),
    );
    const error = vi.fn();
    const session = new WakeSession({
      wait,
      turn,
      feedback,
      state: (s) => states.push(s),
      error,
    });
    expect(wait).not.toHaveBeenCalled();
    session.unmute();
    session.unmute();
    expect(wait).toHaveBeenCalledTimes(1);
    expect(turn).not.toHaveBeenCalled();
    session.mute();
    await session.idle();
    expect(states.at(-1)).toBe('muted');
    expect(error).not.toHaveBeenCalled();
    wait.mockImplementation(async () => {
      throw new Error('engine failure');
    });
    session.unmute();
    await session.idle();
    expect(wait).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
    expect(turn).not.toHaveBeenCalled();
  });
  it('closes wake capture before feedback/turn and never listens during playback; mute prevents rearming', async () => {
    const sequence: string[] = [];
    let finish: (() => void) | undefined;
    const session = new WakeSession({
      wait: async () => {
        sequence.push('wake closed');
      },
      feedback: async () => {
        sequence.push('beep');
      },
      turn: async (signal) => {
        sequence.push('capture then playback');
        await new Promise<void>((resolve) => {
          finish = resolve;
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      state: () => {},
      error: () => {},
    });
    session.unmute();
    await tick();
    expect(sequence).toEqual(['wake closed', 'beep', 'capture then playback']);
    session.mute();
    finish?.();
    await session.idle();
    expect(sequence).toHaveLength(3);
  });
  it('mute during activation prevents upload/capture', async () => {
    const turn = vi.fn();
    let done: (() => void) | undefined;
    const session = new WakeSession({
      wait: async () => {},
      feedback: () =>
        new Promise<void>((resolve) => {
          done = resolve;
        }),
      turn,
      state: () => {},
      error: () => {},
    });
    session.unmute();
    await tick();
    session.mute();
    done?.();
    await session.idle();
    expect(turn).not.toHaveBeenCalled();
  });
});
