# MVP4 setup and recovery

Build with `yarn install --immutable` and `yarn check`. Keep the existing mock defaults. Enable and accept one capability at a time; see [contracts and limits](../specs/mvp4.md).

## Memory

In **Settings → Approved preferences**, approve using saved preferences and click **Enable memory**. No restart is needed. Memory starts off, including after upgrading from the retired environment flag, and its API setting persists across restarts. Choose language/style, tick explicit approval and save. Saving the same category edits it. Inspect provenance and delete there. Mock `show preferences` reports active values without a provider request; real OpenAI receives fixed presentation instructions. Click **Disable memory** to stop injecting saved preferences without deleting them. Delete a preference to remove it from subsequent context. Review backup retention separately; earlier messages remain historical records.

For API clients, inspect `GET /preferences`. Enable or disable with:

```sh
curl -X POST http://127.0.0.1:3001/preferences/control \
  -H 'Content-Type: application/json' -d '{"enabled":true,"consent":true}'
curl -X POST http://127.0.0.1:3001/preferences/control \
  -H 'Content-Type: application/json' -d '{"enabled":false}'
```

The response reports the persisted `enabled` state. Existing in-flight agent turns keep their earlier preference snapshot; later typed/voice chat processing uses the new state. Disabling preserves saved preferences. The old `MEMORY_ENABLED` environment variable has no effect.

## Automations

Set `AUTOMATIONS_ENABLED=true`, optionally `AUTOMATION_POLL_MS=5000`, restart API. In **Automations**, create a disabled source-transition → target-on/off rule using visible/write-granted lights. Dry-run it. Approve/enable the rule, then separately approve global execution. Confirm the displayed source, target, state and cooldown before activation. In mock mode, change the source using direct controls, wait two poll intervals, refresh receipts and inspect the linked audit. Use only simulated lights for initial acceptance.

**Emergency stop all automations** persists a global disable even if HA is offline. For CLI recovery:

```sh
curl -X POST http://127.0.0.1:3001/automations/control \
  -H 'Content-Type: application/json' -d '{"enabled":false}'
```

Also set `AUTOMATIONS_ENABLED=false` and restart for a configuration-level stop. Both forms leave rules/receipts for inspection. Approved activation otherwise survives restart. Disable individual rules or delete/recreate to edit; recreated rules need fresh consent. Do not retry a pending/uncertain receipt as an event. Inspect actual device state/audit first. Snapshot polling has no event-history catchup and can miss quick transitions. The global cap is four attempts/minute; minimum rule cooldown is 60 seconds.

For repeatable smoke validation, `yarn verify:mvp4 --restart` exercises only an empty disposable mock stack with the automation server flag enabled and memory initially off. The script explicitly enables memory through its API and verifies restart durability. Set `AURA_API_URL` to its API origin; set `COMPOSE_PROJECT_NAME` and `COMPOSE_FILE` to that same isolated stack when using `--restart`. It refuses non-mock health or existing rules/preferences. It creates simulated light operations and historical audit receipts; it leaves memory and global execution disabled and removes its active rule/preference. Run restart checks sequentially with other Compose/voice verification commands.

## Wake word on Linux/Pi

Requires Node 24, `alsa-utils`, working `arecord`/`aplay`, and your own Picovoice account/AccessKey with suitable entitlement. Follow [official Node setup](https://picovoice.ai/docs/quick-start/porcupine-nodejs/). Preserve the separate satellite credential boundary from [voice setup](voice.md). Never put an OpenAI/HA key or Picovoice key in browser variables.

Add to private, Git/Docker-ignored `.env.voice-satellite`:

```dotenv
AURA_API_URL=http://127.0.0.1:3001
SATELLITE_TOKEN=your-server-matching-random-scoped-token
WAKE_ENABLED=true
PICOVOICE_ACCESS_KEY=your-own-access-key
WAKE_SENSITIVITY=0.5
ALSA_CAPTURE_DEVICE=default
ALSA_PLAYBACK_DEVICE=default
# Optional custom platform-specific keyword and matching language model:
# WAKE_KEYWORD_PATH=/absolute/path/aura_raspberry-pi.ppn
# WAKE_MODEL_PATH=/absolute/path/porcupine_params_es.pv
```

Use HTTPS or a localhost SSH tunnel for a remote API. Then `yarn build` and `yarn voice:wake`. It starts muted. Enter `u` then Enter to listen. Say **Porcupine**, wait for the beep, speak a short command, and wait for response playback. Enter `m` then Enter to mute; wait for the **muted** status confirming capture closure. Enter `q` then Enter to exit; SIGINT/SIGTERM also stop. Terminal EOF mutes/exits. The microphone is closed during beep/playback. An audio or request failure mutes the session and requires deliberate unmute; after submission inspect the printed conversation's history/audit and device state before trying again. No automatic resubmission occurs.

Unset `WAKE_ENABLED` or return to `yarn voice:once` for deliberate capture. Wake is not a daemon/service and does not automatically listen after process restart. A custom “Aura” model is not bundled. No AccessKey is needed for fixture tests; do not treat those tests as engine activation or hardware acceptance.

Before rollout, measure false activations per listening hour, missed activations over a labeled test set, keyword-to-beep/turn latency, CPU/RSS, mute closure and speaker echo under expected room noise. Agree numeric thresholds from those measurements, record hardware/model/language/sensitivity and enable only after acceptance. Browser microphone and live speech acceptance from MVP3 remain separate gates.
