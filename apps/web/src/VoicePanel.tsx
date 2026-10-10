import { useEffect, useRef, useState } from 'react';
import { encodeBase64, decodeBase64, readVoiceEvents } from '@aura/contracts';
import { startRecording } from './voice-capture.js';
import type { VoiceRecording } from './voice-capture.js';

export function VoicePanel(props: {
  disabled: boolean;
  conversationId(): string | undefined;
  onConversation(id: string): void;
  onLine(role: 'user' | 'assistant', text: string): void;
  onBusy(busy: boolean): void;
  onComplete(): void;
}) {
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('');
  const [inspectionId, setInspectionId] = useState('');
  const [replay, setReplay] = useState(false);
  const recording = useRef<VoiceRecording | null>(null);
  const controller = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef('');
  const active = useRef(false);
  const finishRef = useRef<() => Promise<void>>(async () => {});
  const mounted = useRef(true);
  function clearAudio() {
    if (audio.current) {
      audio.current.pause();
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current = null;
    }
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = '';
    setReplay(false);
  }
  function settle() {
    active.current = false;
    props.onBusy(false);
  }
  useEffect(() => {
    mounted.current = true;
    const request = new AbortController();
    void fetch('/api/voice/capabilities', { signal: request.signal })
      .then((r) => r.json())
      .then((value: { mode: string }) => setMode(value.mode))
      .catch(() => {});
    return () => {
      mounted.current = false;
      request.abort();
      controller.current?.abort();
      recording.current?.discard();
      if (audio.current) {
        audio.current.onended = null;
        audio.current.onerror = null;
        audio.current.pause();
      }
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);
  async function play() {
    if (!audio.current) return;
    props.onBusy(true);
    active.current = true;
    setPhase('playback');
    try {
      await audio.current.play();
      setReplay(false);
    } catch {
      setError(
        'Playback was blocked. Tap Play reply to listen; the text turn is already saved.',
      );
      setReplay(true);
      setPhase('error');
      settle();
    }
  }
  async function finish() {
    const capture = recording.current;
    if (!capture) return;
    recording.current = null;
    setPhase('transcribing');
    try {
      const wav = await capture.stop();
      const response = await fetch('/api/voice/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: encodeBase64(wav),
          ...(props.conversationId()
            ? { conversationId: props.conversationId() }
            : {}),
        }),
        signal: AbortSignal.any([
          controller.current!.signal,
          AbortSignal.timeout(180000),
        ]),
      });
      for await (const event of readVoiceEvents(response)) {
        if (!mounted.current) return;
        if (event.type === 'accepted') {
          props.onConversation(event.conversationId);
          setInspectionId(event.conversationId);
        }
        if (event.type === 'phase') setPhase(event.phase);
        if (event.type === 'transcript') props.onLine('user', event.text);
        if (event.type === 'response') props.onLine('assistant', event.message);
        if (event.type === 'audio') {
          const bytes = decodeBase64(event.audioBase64);
          audioUrl.current = URL.createObjectURL(
            new Blob([bytes as BlobPart], { type: 'audio/wav' }),
          );
          audio.current = new Audio(audioUrl.current);
          audio.current.onended = () => {
            setPhase('idle');
            clearAudio();
            settle();
          };
          audio.current.onerror = () => {
            setError('Speaker playback failed. The text response is saved.');
            setPhase('error');
            clearAudio();
            settle();
          };
        }
        if (event.type === 'error') throw new Error(event.message);
      }
      props.onComplete();
      if (!audio.current)
        throw new Error(
          'No reply audio received. Inspect history before retrying.',
        );
      await play();
    } catch (failure) {
      if (!mounted.current) return;
      setError(failure instanceof Error ? failure.message : 'Voice failed.');
      setPhase('error');
      clearAudio();
      settle();
      props.onComplete();
    }
  }
  finishRef.current = finish;
  async function start() {
    if (active.current || props.disabled) return;
    active.current = true;
    props.onBusy(true);
    clearAudio();
    setError('');
    setInspectionId('');
    setPhase('permission');
    const request = new AbortController();
    controller.current = request;
    try {
      const capture = await startRecording(
        request.signal,
        () => void finishRef.current(),
        () => {
          recording.current = null;
          setError('Microphone disconnected. No recording was submitted.');
          setPhase('error');
          settle();
        },
      );
      if (!mounted.current || request.signal.aborted) {
        capture.discard();
        return;
      }
      recording.current = capture;
      setPhase('recording');
    } catch (failure) {
      if (!mounted.current || request.signal.aborted) return;
      setError(
        failure instanceof Error && failure.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow microphone access in browser settings, then try again.'
          : failure instanceof Error
            ? failure.message
            : 'Could not capture audio.',
      );
      setPhase('error');
      settle();
    }
  }
  function discard() {
    controller.current?.abort();
    recording.current?.discard();
    recording.current = null;
    setPhase('idle');
    settle();
  }
  return (
    <aside className="voice-panel" aria-label="Voice">
      <h2>Talk to Aura</h2>
      <p>
        Start recording, speak, then send. Recording stops after 20 seconds.
      </p>
      <p>
        {mode === 'mock'
          ? 'Mock speech: recordings produce “status” and a reply tone.'
          : 'Voice replies are AI-generated. Audio is sent to the configured speech provider.'}
      </p>
      <p role="status" aria-live="polite">
        Voice: {phase}
      </p>
      <div className="voice-actions">
        {['idle', 'error'].includes(phase) && (
          <button
            type="button"
            onClick={() => void start()}
            disabled={props.disabled}
          >
            Start recording
          </button>
        )}
        {phase === 'recording' && (
          <button type="button" onClick={() => void finish()}>
            Stop and send
          </button>
        )}
        {['permission', 'recording'].includes(phase) && (
          <button type="button" onClick={discard}>
            Discard recording
          </button>
        )}
        {phase === 'playback' && (
          <button
            type="button"
            onClick={() => {
              clearAudio();
              setPhase('idle');
              settle();
            }}
          >
            Stop playback
          </button>
        )}
        {replay && (
          <button
            type="button"
            onClick={() => void play()}
            disabled={props.disabled}
          >
            Play reply
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error} Inspect history, audit and device state before resubmitting.
        </p>
      )}
      {inspectionId && (
        <p className="voice-inspection">
          Conversation: <code>{inspectionId}</code> ·{' '}
          <a
            href={`/api/conversations/${inspectionId}/messages`}
            target="_blank"
            rel="noreferrer"
          >
            History
          </a>{' '}
          ·{' '}
          <a
            href={`/api/conversations/${inspectionId}/audit`}
            target="_blank"
            rel="noreferrer"
          >
            Audit
          </a>
        </p>
      )}
      <small>
        Discard sends nothing. Stop playback only stops the speaker. Submitted
        actions may complete after disconnection; recordings are never queued or
        automatically retried.
      </small>
    </aside>
  );
}
