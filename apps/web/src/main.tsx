import { StrictMode, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  chatEventSchema,
  deviceListSchema,
  deviceControlResponseSchema,
  deviceControlErrorSchema,
  auditListSchema,
} from '@aura/contracts';
import type { Device } from '@aura/contracts';
import './style.css';
import { AutomationsPanel } from './AutomationsPanel.js';
import { PreferencesPanel } from './PreferencesPanel.js';
import { VoicePanel } from './VoicePanel.js';
import { scheduleChatConnection } from './chat-connection.js';
import { DashboardNav } from './DashboardNav.js';

interface Line {
  role: 'user' | 'assistant';
  content: string;
}

const pages = {
  things: {
    title: 'Things',
    description: 'A little care for your connected home.',
  },
  conversation: {
    title: 'Conversation',
    description: 'Your home, one conversation away.',
  },
  voice: { title: 'Voice', description: 'A conversation, at your pace.' },
  settings: {
    title: 'Settings',
    description: 'Make Aura feel at home with you.',
  },
};
type Page = keyof typeof pages;
const navigationItems = (Object.keys(pages) as Page[]).map((id) => ({
  id,
  title: pages[id].title,
  href: `#/${id}`,
}));

function pageFromHash(): Page {
  const hash = location.hash.slice(1).replace(/^\//, '');
  return Object.hasOwn(pages, hash) ? (hash as Page) : 'things';
}

function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const pageHeading = useRef<HTMLHeadingElement | null>(null);
  const previousPage = useRef(page);
  useEffect(() => {
    const navigate = () => setPage(pageFromHash());
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    document.title = `${pages[page].title} · Aura`;
    if (previousPage.current !== page) {
      pageHeading.current?.focus();
      window.scrollTo(0, 0);
      previousPage.current = page;
    }
  }, [page]);
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [status, setStatus] = useState('Connecting…');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('');
  const [deviceBackend, setDeviceBackend] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const [controlBusy, setControlBusy] = useState<string | null>(null);
  const [controlStatus, setControlStatus] = useState('');
  const [audit, setAudit] = useState<
    { deviceId: string; state: string; status: string }[]
  >([]);
  const readOnly =
    deviceBackend === 'home-assistant' &&
    !devices.some((device) => device.canControl);
  const conversationId = useRef<string | undefined>(undefined);
  const socket = useRef<WebSocket | null>(null);
  const deviceRequest = useRef<AbortController | null>(null);
  const controlInFlight = useRef(false);
  const conversationView = useRef<HTMLElement | null>(null);
  const composerView = useRef<HTMLFormElement | null>(null);
  const pendingComposerScroll = useRef(false);
  useEffect(() => {
    if (page !== 'conversation') return;
    const view = conversationView.current;
    if (view) view.scrollTop = view.scrollHeight;
    if (lines.length > 0) {
      pendingComposerScroll.current = true;
      composerView.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [lines, page]);
  useEffect(() => {
    if (page !== 'conversation') return;
    if (pendingComposerScroll.current && !busy && !voiceBusy && !devicesBusy) {
      composerView.current?.scrollIntoView({ block: 'nearest' });
      pendingComposerScroll.current = false;
    }
  }, [lines, busy, voiceBusy, devicesBusy, page]);
  async function setLight(device: Device, state: 'on' | 'off') {
    if (controlInFlight.current) return;
    controlInFlight.current = true;
    setControlBusy(device.id);
    setControlStatus('');
    setAudit([]);
    let auditConversationId: string | undefined;
    try {
      const response = await fetch('/api/device-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, state }),
        signal: AbortSignal.timeout(100000),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = deviceControlErrorSchema.parse(payload);
        auditConversationId = failure.conversationId;
        throw new Error(failure.message);
      }
      const result = deviceControlResponseSchema.parse(payload);
      auditConversationId = result.conversationId;
      setControlStatus(`${result.device.name} is ${result.device.state}.`);
    } catch (error) {
      setControlStatus(
        error instanceof Error && error.name === 'Error'
          ? error.message
          : 'The outcome is unknown. Refresh device state and inspect the audit before retrying.',
      );
    } finally {
      await refreshDevices();
      if (auditConversationId) {
        try {
          const response = await fetch(
            `/api/conversations/${encodeURIComponent(auditConversationId)}/audit`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (!response.ok) throw new Error('Audit unavailable');
          setAudit(auditListSchema.parse(await response.json()));
        } catch {
          setControlStatus(
            (current) =>
              `${current} Audit could not be loaded; inspect state before retrying.`,
          );
        }
      }
      setControlBusy(null);
      controlInFlight.current = false;
    }
  }
  async function refreshDevices() {
    deviceRequest.current?.abort();
    const controller = new AbortController();
    deviceRequest.current = controller;
    setDevicesBusy(true);
    setDeviceError('');
    setDevices([]);
    try {
      const response = await fetch('/api/devices', {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10000),
        ]),
      });
      if (!response.ok) throw new Error('Device read failed');
      const result = deviceListSchema.parse(await response.json());
      if (!controller.signal.aborted) setDevices(result);
    } catch {
      if (!controller.signal.aborted)
        setDeviceError(
          'Could not read devices. Check the connection and server configuration, then refresh.',
        );
    } finally {
      if (!controller.signal.aborted) setDevicesBusy(false);
    }
  }
  useEffect(() => {
    const disconnect = scheduleChatConnection(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/chat/stream`,
      (connection) => {
        socket.current = connection;
        connection.onopen = () => setStatus('Connected');
        connection.onclose = () => {
          setStatus('Disconnected · reload to reconnect');
          setBusy(false);
        };
        connection.onerror = () =>
          setError(
            `Could not connect to the API. Check that it is running and WEB_ORIGIN matches ${location.origin}. For the default setup, open http://localhost:5173.`,
          );
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
                      {
                        role: 'assistant',
                        content: last.content + parsed.text,
                      },
                    ]
                  : [...current, { role: 'assistant', content: parsed.text }];
              });
            if (parsed.type === 'done') {
              setBusy(false);
              void refreshDevices();
            }
            if (parsed.type === 'error') {
              setError(parsed.message);
              setBusy(false);
              void refreshDevices();
            }
          } catch {
            setError('The server sent an invalid response.');
            setBusy(false);
          }
        };
      },
    );
    void fetch('/api/health')
      .then((response) => response.json())
      .then((health: { mode: string; devices: string }) => {
        setMode(health.mode);
        setDeviceBackend(health.devices);
      })
      .catch(() => setError('API healthcheck failed.'));
    void refreshDevices();
    return () => {
      deviceRequest.current?.abort();
      disconnect();
      socket.current = null;
    };
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !message.trim() ||
      busy ||
      voiceBusy ||
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
    <main className="aura-app" id="home">
      <DashboardNav items={navigationItems} activeId={page} />
      <header>
        <p className="eyebrow">HOME INTELLIGENCE</p>
        <h1 key={page} ref={pageHeading} tabIndex={-1}>
          {pages[page].title}
        </h1>
        <p key={`${page}-description`} className="page-description">
          {pages[page].description}
        </p>
        <p
          className="status"
          role="status"
          data-connection={
            status === 'Connected'
              ? 'connected'
              : status === 'Connecting…'
                ? 'connecting'
                : 'disconnected'
          }
        >
          {status}
          {mode && ` · ${mode} agent`}
          {deviceBackend &&
            (deviceBackend === 'home-assistant'
              ? ' · Home Assistant'
              : ' · simulated devices')}
        </p>
      </header>
      <aside
        id="things"
        hidden={page !== 'things'}
        aria-label="Things"
        className="devices"
        data-busy={devicesBusy || controlBusy !== null}
        data-read-only={readOnly}
      >
        <div className="device-heading">
          <h2>Things</h2>
          <button
            className="action-secondary"
            type="button"
            onClick={() => void refreshDevices()}
            disabled={devicesBusy}
          >
            {devicesBusy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {readOnly && (
          <p>Read-only snapshots. Refresh to check the latest state.</p>
        )}
        {!readOnly && (
          <p>
            Direct controls work without the chat agent. States are snapshots;
            refresh to inspect them.
          </p>
        )}
        {deviceError && (
          <p role="alert" className="error">
            {deviceError}
          </p>
        )}
        <ul className="device-list" role="list" aria-label="Things">
          {devices.map((device) => (
            <li
              key={device.id}
              className="device-card"
              data-state={device.state}
              data-busy={controlBusy === device.id}
            >
              <h3 className="device-name">{device.name}</h3>
              <p className="device-state">{device.state}</p>
              {device.canControl && (
                <div className="light-controls">
                  {(['on', 'off'] as const).map((state) => (
                    <button
                      key={state}
                      type="button"
                      aria-label={`Turn ${state} ${device.name}`}
                      onClick={() => void setLight(device, state)}
                      disabled={
                        controlBusy !== null ||
                        devicesBusy ||
                        !['on', 'off'].includes(device.state)
                      }
                    >
                      {controlBusy === device.id
                        ? 'Working…'
                        : state === 'on'
                          ? 'On'
                          : 'Off'}
                    </button>
                  ))}
                </div>
              )}
              {device.observedAt && (
                <small>
                  Observed {new Date(device.observedAt).toLocaleString()}
                </small>
              )}
            </li>
          ))}
        </ul>
        {controlStatus && (
          <p className="panel-notice" role="status">
            {controlStatus}
          </p>
        )}
        {audit.length > 0 && (
          <div className="control-audit" aria-label="Last control audit">
            <h3>Last control</h3>
            {audit.map((entry, index) => (
              <p key={index} data-outcome={entry.status}>
                {entry.deviceId} → {entry.state}: {entry.status}
              </p>
            ))}
          </div>
        )}
      </aside>
      <section
        className="dashboard-chat"
        id="conversation"
        hidden={page !== 'conversation'}
        aria-label="Chat with Aura"
      >
        <div className="chat-heading">
          <span className="eyebrow">YOUR HOME ASSISTANT</span>
          <h2>A little help from Aura.</h2>
        </div>
        <section
          ref={conversationView}
          className="conversation"
          aria-label="Conversation"
          aria-live="polite"
        >
          {lines.length === 0 && (
            <div className="welcome">
              <h2>Start with a light.</h2>
              <p>
                {deviceBackend === 'home-assistant'
                  ? 'Try “list devices” or “status”.'
                  : 'Try “list devices” or “turn on living room”.'}
              </p>
              <p>
                {deviceBackend === 'home-assistant'
                  ? 'Only configured Home Assistant lights are visible. Granted lights have direct controls.'
                  : 'Living room and bedroom are available as mock lights.'}
              </p>
            </div>
          )}
          {lines.map((line, index) => (
            <article key={index} className={line.role}>
              <strong>{line.role === 'user' ? 'You' : 'Aura'}</strong>
              <p>{line.content}</p>
            </article>
          ))}
          {busy && (
            <p className="chat-progress" role="status">
              Aura is responding…
            </p>
          )}
        </section>
        <form
          className="chat-form"
          data-busy={busy || voiceBusy}
          ref={composerView}
          onSubmit={submit}
        >
          <label htmlFor="message">Message Aura</label>
          <div className="composer">
            <input
              id="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={4000}
              placeholder={
                deviceBackend === 'home-assistant'
                  ? 'List devices'
                  : 'Turn on living room'
              }
              disabled={busy || voiceBusy}
            />
            <button
              disabled={
                busy || voiceBusy || !message.trim() || status !== 'Connected'
              }
            >
              Send
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" className="error chat-error">
            {error}
          </p>
        )}
      </section>
      <div className="dashboard-voice" id="voice" hidden={page !== 'voice'}>
        <VoicePanel
          visible={page === 'voice'}
          disabled={busy || voiceBusy}
          conversationId={() => conversationId.current}
          onConversation={(id) => {
            conversationId.current = id;
          }}
          onLine={(role, content) =>
            setLines((current) => [...current, { role, content }])
          }
          onBusy={setVoiceBusy}
          onComplete={() => void refreshDevices()}
        />
      </div>
      <section
        className="dashboard-settings"
        id="settings"
        hidden={page !== 'settings'}
        aria-label="Home settings"
      >
        <PreferencesPanel />
        <AutomationsPanel />
      </section>
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
