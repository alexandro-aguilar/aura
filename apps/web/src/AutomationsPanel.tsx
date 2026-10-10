import { useEffect, useState } from 'react';
import { automationListSchema, deviceListSchema } from '@aura/contracts';
import type { AutomationRule, AutomationRun, Device } from '@aura/contracts';
export function AutomationsPanel() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [triggerState, setTriggerState] = useState('on');
  const [actionState, setActionState] = useState('on');
  const [cooldown, setCooldown] = useState(60);
  async function refresh() {
    const response = await fetch('/api/automations', {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Could not load automations.');
    const data = automationListSchema.parse(await response.json());
    setRules(data.rules);
    setRuns(data.runs);
    setAvailable(data.available);
    setEnabled(data.enabled);
  }
  useEffect(() => {
    void refresh().catch(() => setMessage('Automations unavailable.'));
    void fetch('/api/devices', { signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        if (response.ok)
          setDevices(deviceListSchema.parse(await response.json()));
      })
      .catch(() =>
        setMessage(
          'Device discovery unavailable; emergency stop remains available.',
        ),
      );
  }, []);
  async function mutate(path: string, body?: unknown, method = 'POST') {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/automations${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(
          error.message ?? 'Request failed. Refresh before retrying.',
        );
      }
      if (path.endsWith('/dry-run')) {
        const result = (await response.json()) as {
          matches: boolean;
          note: string;
        };
        setMessage(
          `${result.matches ? 'Trigger matches.' : 'Trigger does not match.'} ${result.note}`,
        );
      }
      setConsent(false);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="settings-panel" aria-label="Deterministic automations">
      <h2>Automations</h2>
      <p>
        {!available
          ? 'Automations are disabled in server configuration.'
          : enabled
            ? 'Approved rules are active.'
            : 'Emergency stop is on. No new automation actions will start.'}{' '}
        All new rules start disabled.
      </p>
      <button
        type="button"
        onClick={() => void mutate('/control', { enabled: false })}
      >
        Emergency stop all automations
      </button>
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />{' '}
        I approve the next activation shown here.
      </label>
      <button
        type="button"
        disabled={busy || enabled || !available || !consent}
        onClick={() =>
          void mutate('/control', { enabled: true, consent: true })
        }
      >
        Enable automation execution
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutate('', {
            name,
            trigger: { deviceId: source, state: triggerState },
            action: { deviceId: target, state: actionState },
            cooldownSeconds: cooldown,
          });
        }}
      >
        <label htmlFor="rule-name">Rule name</label>
        <input
          id="rule-name"
          value={name}
          required
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor="rule-source">When light changes</label>
        <select
          id="rule-source"
          required
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">Choose source</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Trigger state"
          value={triggerState}
          onChange={(e) => setTriggerState(e.target.value)}
        >
          <option>on</option>
          <option>off</option>
        </select>
        <label htmlFor="rule-target">Set light</label>
        <select
          id="rule-target"
          required
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">Choose target</option>
          {devices
            .filter((d) => d.canControl && d.id !== source)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Action state"
          value={actionState}
          onChange={(e) => setActionState(e.target.value)}
        >
          <option>on</option>
          <option>off</option>
        </select>
        <label htmlFor="rule-cooldown">Minimum seconds between attempts</label>
        <input
          id="rule-cooldown"
          type="number"
          min={60}
          max={86400}
          value={cooldown}
          onChange={(e) => setCooldown(Number(e.target.value))}
        />
        <button disabled={busy}>Create disabled rule</button>
      </form>
      <ul>
        {rules.map((rule) => (
          <li key={rule.id}>
            <strong>{rule.name}</strong>: {rule.trigger.deviceId} →{' '}
            {rule.trigger.state}; set {rule.action.deviceId} {rule.action.state}
            . Cooldown {rule.cooldownSeconds}s.{' '}
            {rule.enabled ? 'Enabled' : 'Disabled'}.
            <button
              disabled={busy || (!rule.enabled && (!available || !consent))}
              onClick={() =>
                void mutate(
                  `/${rule.id}/activation`,
                  rule.enabled
                    ? { enabled: false }
                    : { enabled: true, consent: true },
                )
              }
            >
              {rule.enabled ? 'Disable' : 'Approve and enable'} {rule.name}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void mutate(`/${rule.id}/dry-run`, {
                  id: crypto.randomUUID(),
                  deviceId: rule.trigger.deviceId,
                  from: rule.trigger.state === 'on' ? 'off' : 'on',
                  to: rule.trigger.state,
                  observedAt: new Date().toISOString(),
                })
              }
            >
              Dry run {rule.name}
            </button>
            <button
              disabled={busy}
              onClick={() => void mutate(`/${rule.id}`, undefined, 'DELETE')}
            >
              Delete {rule.name}
            </button>
          </li>
        ))}
      </ul>
      <p>
        Snapshot polling can miss short transitions. Four attempts per minute
        across all rules; cycles are rejected. Emergency stop cannot undo an
        action already dispatched.
      </p>
      <button
        disabled={busy}
        onClick={() =>
          void refresh().catch(() => setMessage('Refresh failed.'))
        }
      >
        Refresh rules and receipts
      </button>
      <ul>
        {runs.map((run) => (
          <li key={run.id}>
            {run.rule.name}: {run.status} at{' '}
            {new Date(run.createdAt).toLocaleString()} ·{' '}
            <a
              href={`/api/conversations/${run.conversationId}/audit`}
              target="_blank"
              rel="noreferrer"
            >
              Audit
            </a>
            {run.status === 'pending' &&
              ' — incomplete; inspect state, never automatically replayed'}
          </li>
        ))}
      </ul>
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
