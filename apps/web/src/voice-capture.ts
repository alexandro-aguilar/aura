import {
  pcmToWav,
  VOICE_SAMPLE_RATE,
  VOICE_MAX_SECONDS,
} from '@aura/contracts';

export interface VoiceRecording {
  stop(): Promise<Uint8Array>;
  discard(): void;
}
export async function startRecording(
  signal: AbortSignal,
  onLimit: () => void,
  onFailure: () => void,
): Promise<VoiceRecording> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new Error(
      'Microphone capture requires localhost or HTTPS and a supported browser.',
    );
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    video: false,
  });
  if (signal.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Recording discarded.');
  }
  let context: AudioContext | undefined;
  let node: AudioWorkletNode | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', cleanup);
    if (node) {
      node.port.onmessage = null;
      node.disconnect();
      node.port.close();
    }
    stream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (context) void context.close().catch(() => {});
  };
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    context = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE });
    if (context.sampleRate !== VOICE_SAMPLE_RATE)
      throw new Error(
        'This browser cannot capture at 16 kHz. Use another browser or the satellite.',
      );
    await context.audioWorklet.addModule('/pcm-capture.js');
    signal.throwIfAborted();
    node = new AudioWorkletNode(context, 'aura-pcm-capture');
    const source = context.createMediaStreamSource(stream);
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(context.destination);
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (stopped) return;
      const count = Math.min(
        event.data.length,
        VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS - length / 2,
      );
      const bytes = new Uint8Array(count * 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < count; i++) {
        const value = Math.max(-1, Math.min(1, event.data[i] ?? 0));
        view.setInt16(
          i * 2,
          Math.round(value * (value < 0 ? 32768 : 32767)),
          true,
        );
      }
      chunks.push(bytes);
      length += bytes.length;
      if (length >= VOICE_SAMPLE_RATE * 2 * VOICE_MAX_SECONDS) onLimit();
    };
    for (const track of stream.getAudioTracks())
      track.onended = () => {
        cleanup();
        onFailure();
      };
    await context.resume();
    signal.throwIfAborted();
    if (stopped)
      throw new Error('Microphone stopped before recording could begin.');
    timer = setTimeout(onLimit, VOICE_MAX_SECONDS * 1000);
    return {
      async stop() {
        cleanup();
        const pcm = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          pcm.set(chunk, offset);
          offset += chunk.length;
        }
        chunks.length = 0;
        if (length < 3200)
          throw new Error('Recording was too short. Try again.');
        return pcmToWav(pcm);
      },
      discard() {
        cleanup();
        chunks.length = 0;
      },
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
