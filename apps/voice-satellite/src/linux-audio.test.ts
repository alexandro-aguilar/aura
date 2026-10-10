import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { captureAlsa, playAlsa } from './linux-audio.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
function child() {
  const process = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stdin: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  process.stdout = new PassThrough();
  process.stdin = new PassThrough();
  process.kill = vi.fn(() => {
    queueMicrotask(() => process.emit('close', 1));
    return true;
  });
  vi.mocked(spawn).mockReturnValue(
    process as unknown as ReturnType<typeof spawn>,
  );
  return process;
}
afterEach(() => vi.clearAllMocks());
describe('ALSA process lifecycle', () => {
  it('accepts ALSA’s intentional end-of-speech exit 1 and releases capture before resolving', async () => {
    const process = child();
    const recording = captureAlsa(new AbortController().signal);
    const pcm = Buffer.alloc(32000 * 2);
    for (let i = 0; i < 12800; i += 2) pcm.writeInt16LE(6000, i);
    process.stdout.write(pcm);
    expect((await recording).length).toBeGreaterThan(44);
    expect(process.kill).toHaveBeenCalledWith('SIGTERM');
  });
  it('rejects microphone removal and missing capture executable without submission', async () => {
    const process = child();
    const recording = captureAlsa(new AbortController().signal);
    process.emit('close', 1);
    await expect(recording).rejects.toThrow('unexpectedly');
    const absent = child();
    const failed = captureAlsa(new AbortController().signal);
    absent.emit('error', new Error('ENOENT'));
    absent.emit('close', -2);
    await expect(failed).rejects.toThrow('Install alsa-utils');
  });
  it('terminates capture on cancellation and reports a saved turn on speaker failure', async () => {
    const process = child();
    const controller = new AbortController();
    const recording = captureAlsa(controller.signal);
    controller.abort();
    await expect(recording).rejects.toThrow('cancelled');
    expect(process.kill).toHaveBeenCalledWith('SIGTERM');
    const speaker = child();
    const playback = playAlsa(new Uint8Array(44), new AbortController().signal);
    speaker.stdin.emit('error', new Error('EPIPE'));
    speaker.emit('close', 1);
    await expect(playback).rejects.toThrow('text response is saved');
  });
});
