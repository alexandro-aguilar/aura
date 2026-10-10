import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateVoiceWav } from '@aura/contracts';
import { startRecording } from './voice-capture.js';

const stop = vi.fn();
const close = vi.fn().mockResolvedValue(undefined);
const track = { stop, onended: null as (() => void) | null };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
let lastNode: {
  port: {
    onmessage: ((event: { data: Float32Array }) => void) | null;
    close: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};
function setup() {
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      sampleRate = 16000;
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      destination = {};
      close = close;
      resume = vi.fn().mockResolvedValue(undefined);
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      createGain() {
        return { gain: { value: 1 }, connect: vi.fn() };
      }
    },
  );
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { onmessage: null, close: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor() {
        lastNode = this;
      }
    },
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('browser microphone lifecycle', () => {
  it('encodes canonical WAV and releases all capture resources before submission', async () => {
    setup();
    const recording = await startRecording(
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
    );
    lastNode.port.onmessage?.({ data: new Float32Array(16000).fill(0.25) });
    const wav = await recording.stop();
    expect(() => validateVoiceWav(wav)).not.toThrow();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(lastNode.port.close).toHaveBeenCalledTimes(1);
  });
  it('discards late microphone permissions after cancellation without opening an audio graph', async () => {
    setup();
    let grant!: (value: typeof stream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(
      () =>
        new Promise((resolve) => {
          grant = resolve as unknown as typeof grant;
        }),
    );
    const controller = new AbortController();
    const request = startRecording(controller.signal, vi.fn(), vi.fn());
    controller.abort();
    grant(stream);
    await expect(request).rejects.toThrow('discarded');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });
  it('releases capture and reports microphone removal; discard is idempotent', async () => {
    setup();
    const failure = vi.fn();
    const recording = await startRecording(
      new AbortController().signal,
      vi.fn(),
      failure,
    );
    track.onended?.();
    recording.discard();
    expect(failure).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('rejects insecure context and allows a new request after permission denial', async () => {
    setup();
    vi.stubGlobal('window', { isSecureContext: false });
    await expect(
      startRecording(new AbortController().signal, vi.fn(), vi.fn()),
    ).rejects.toThrow('localhost or HTTPS');
    setup();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException('denied', 'NotAllowedError'),
    );
    await expect(
      startRecording(new AbortController().signal, vi.fn(), vi.fn()),
    ).rejects.toMatchObject({ name: 'NotAllowedError' });
    const recording = await startRecording(
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
    );
    recording.discard();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('bounds audio samples to 20 seconds and signals automatic stop', async () => {
    setup();
    const limit = vi.fn();
    const recording = await startRecording(
      new AbortController().signal,
      limit,
      vi.fn(),
    );
    lastNode.port.onmessage?.({ data: new Float32Array(400000) });
    expect(limit).toHaveBeenCalledTimes(1);
    expect((await recording.stop()).length).toBe(640044);
  });
});
