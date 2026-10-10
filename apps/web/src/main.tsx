import { StrictMode, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { chatEventSchema } from '@aura/contracts';
import './style.css';

interface Line {
  role: 'user' | 'assistant';
  content: string;
}

function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Connecting…');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('');
  const conversationId = useRef<string | undefined>(undefined);
  const socket = useRef<WebSocket | null>(null);
  useEffect(() => {
    const connection = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/chat/stream`,
    );
    socket.current = connection;
    connection.onopen = () => setStatus('Connected');
    connection.onclose = () => {
      setStatus('Disconnected · reload to reconnect');
      setBusy(false);
    };
    connection.onerror = () => setError('Could not connect to the API.');
    connection.onmessage = (event: MessageEvent<string>) => {
      try {
        const parsed = chatEventSchema.parse(JSON.parse(event.data));
        if (parsed.type === 'started')
          conversationId.current = parsed.conversationId;
        if (parsed.type === 'delta')
          setLines((current) => {
            const last = current.at(-1);
            return last?.role === 'assistant'
              ? [
                  ...current.slice(0, -1),
                  { role: 'assistant', content: last.content + parsed.text },
                ]
              : [...current, { role: 'assistant', content: parsed.text }];
          });
        if (parsed.type === 'done') setBusy(false);
        if (parsed.type === 'error') {
          setError(parsed.message);
          setBusy(false);
        }
      } catch {
        setError('The server sent an invalid response.');
        setBusy(false);
      }
    };
    void fetch('/api/health')
      .then((response) => response.json())
      .then((health: { mode: string }) => setMode(health.mode))
      .catch(() => setError('API healthcheck failed.'));
    return () => {
      connection.onclose = null;
      connection.close();
    };
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !message.trim() ||
      busy ||
      socket.current?.readyState !== WebSocket.OPEN
    )
      return;
    socket.current.send(
      JSON.stringify({
        message: message.trim(),
        ...(conversationId.current
          ? { conversationId: conversationId.current }
          : {}),
      }),
    );
    setLines((current) => [
      ...current,
      { role: 'user', content: message.trim() },
    ]);
    setMessage('');
    setBusy(true);
    setError('');
  }
  return (
    <main>
      <header>
        <p className="eyebrow">HOME INTELLIGENCE · MVP 1</p>
        <h1>Aura</h1>
        <p>Your home, one conversation away.</p>
      </header>
      <p className="status">
        {status}
        {mode && ` · ${mode} agent · simulated devices`}
      </p>
      <section aria-label="Conversation" aria-live="polite">
        {lines.length === 0 && (
          <div className="welcome">
            <h2>Start with a light.</h2>
            <p>Try “list devices” or “turn on living room”.</p>
            <p>Living room and bedroom are available as mock lights.</p>
          </div>
        )}
        {lines.map((line, index) => (
          <article key={index} className={line.role}>
            <strong>{line.role === 'user' ? 'You' : 'Aura'}</strong>
            <p>{line.content}</p>
          </article>
        ))}
        {busy && <p role="status">Aura is responding…</p>}
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form onSubmit={submit}>
        <label htmlFor="message">Message Aura</label>
        <div className="composer">
          <input
            id="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={4000}
            placeholder="Turn on living room"
            disabled={busy}
          />
          <button disabled={busy || !message.trim() || status !== 'Connected'}>
            Send
          </button>
        </div>
      </form>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    /* Chat still works without shell caching. */
  });
}
