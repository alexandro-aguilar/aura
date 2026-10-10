import { useEffect, useState } from 'react';
import { preferenceListSchema, preferenceRequestSchema } from '@aura/contracts';
import type { ApprovedPreference } from '@aura/contracts';

export function PreferencesPanel() {
  const [entries, setEntries] = useState<ApprovedPreference[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [category, setCategory] = useState('response_language');
  const [value, setValue] = useState('en');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    const response = await fetch('/api/preferences', {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Could not load preferences.');
    const data = preferenceListSchema.parse(await response.json());
    setEntries(data.preferences);
    setEnabled(data.enabled);
  }
  useEffect(() => {
    void refresh().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'Preferences unavailable.'),
    );
  }, []);
  async function mutate(id?: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        id ? `/api/preferences/${id}` : '/api/preferences',
        {
          method: id ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(id
            ? {}
            : {
                body: JSON.stringify(
                  preferenceRequestSchema.parse({ category, value, consent }),
                ),
              }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok)
        throw new Error(
          'Preference could not be saved or deleted. Refresh before retrying.',
        );
      setConsent(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preferences unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="settings-panel" aria-label="Approved preferences">
      <h2>Approved preferences</h2>
      <p>
        {enabled
          ? 'Approved preferences apply to new chat and voice turns.'
          : 'Memory context is disabled on the server. Saved preferences will apply only after it is enabled.'}
      </p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.category === 'response_language'
              ? 'Response language'
              : 'Response style'}
            : <strong>{entry.value}</strong>
            <small>
              Approved by you on {new Date(entry.approvedAt).toLocaleString()}
              {entry.sourceConversationId &&
                ` · conversation ${entry.sourceConversationId}`}
            </small>
            <button
              type="button"
              disabled={busy}
              onClick={() => void mutate(entry.id)}
            >
              Delete{' '}
              {entry.category === 'response_language' ? 'language' : 'style'}
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutate();
        }}
      >
        <label htmlFor="preference-category">Preference</label>
        <select
          id="preference-category"
          value={category}
          onChange={(event) => {
            const next = event.target.value;
            setCategory(next);
            setValue(next === 'response_language' ? 'en' : 'concise');
            setConsent(false);
          }}
        >
          <option value="response_language">Response language</option>
          <option value="response_style">Response style</option>
        </select>
        <label htmlFor="preference-value">Value</label>
        <select
          id="preference-value"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setConsent(false);
          }}
        >
          {(category === 'response_language'
            ? [
                ['en', 'English'],
                ['es', 'Spanish'],
              ]
            : [
                ['concise', 'Concise'],
                ['detailed', 'Detailed'],
              ]
          ).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />{' '}
          I approve saving this preference until I delete it.
        </label>
        <button disabled={busy || !consent}>Save approved preference</button>
      </form>
      <p>
        Deleting removes it from active memory and future context. Earlier
        messages and backups retain their own history. Preferences never
        authorize device actions.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </aside>
  );
}
