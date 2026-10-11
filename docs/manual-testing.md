# Aura manual testing guide

Follow sections 1–5 for your first run. They use simulated lights and mock speech, so you need no Raspberry Pi, Home Assistant, or paid API key. Sections 6–7 test preferences and automations. The remaining sections cover optional Docker, Home Assistant, real AI/speech, and Linux audio hardware.

This is a procedure to run yourself, not a report of completed tests. Record your results in the checklist at the end.

## 1. Prepare your Mac

1. Open Terminal and go to the project:

   ```sh
   cd /Users/alexaguilar/Developer/aura
   ```

2. Check the installed tools:

   ```sh
   node --version
   yarn --version
   ```

   Expected: Node **24.x** and Yarn **4.13.0**. If Yarn is missing and your Node installation includes Corepack, run `corepack enable`, then try again. Otherwise install the pinned Yarn release using your existing package manager setup.

3. Install dependencies and verify the project:

   ```sh
   yarn install --immutable
   yarn check
   ```

   Expected: package boundaries, builds, TypeScript, and tests pass. Stop here and inspect the error if a command fails.

4. Create your local configuration **only if `.env` does not already exist**:

   ```sh
   cp -n .env.example .env
   ```

5. Open `.env` in your editor. For this first run, confirm these values, editing existing lines rather than adding duplicates:

   ```dotenv
   AGENT_MODE=mock
   DEVICE_BACKEND=mock
   SPEECH_MODE=mock
   DATABASE_PATH=./data/aura.sqlite
   HOST=127.0.0.1
   PORT=3001
   WEB_ORIGIN=http://localhost:5173
   AUTOMATIONS_ENABLED=false
   ```

   Leave any existing secret values private. These mock settings do not use OpenAI or Home Assistant credentials. Shell environment variables can override file values; if behavior differs, check whether you previously exported these settings.

## 2. Start the application

Use two terminals and leave both running. Choose this source workflow **or** the Docker workflow in section 8; both use API port 3001 and cannot run there simultaneously.

1. In **Terminal A**, start the API:

   ```sh
   cd /Users/alexaguilar/Developer/aura
   yarn dev:api
   ```

   Expected: startup logs show the API listening on port 3001. SQLite is created automatically on first startup.

2. In **Terminal B**, start the web interface:

   ```sh
   cd /Users/alexaguilar/Developer/aura
   yarn dev:web
   ```

3. Open **http://localhost:5173** in your browser. Use `localhost`, matching the configured browser origin.

4. Confirm the page shows **Aura**, **Connected**, **mock agent**, and **simulated devices**. The **Lights** panel should contain **Living room** and **Bedroom**, each with **On** and **Off** buttons.

5. Open **http://localhost:3001/health** in another browser tab. Expected: a successful JSON health response showing mock modes.

If Vite selects another port because 5173 is occupied, free port 5173 before continuing; the configured origin must match the URL you use.

## 3. Send your first chat messages

The **Message Aura** field and **Send** button are below the panels; scroll down if necessary. Mock chat accepts specific commands rather than unrestricted conversation.

1. Enter `list devices` and click **Send**. Expected: Aura lists the two simulated lights.
2. Enter `turn on living room`. Expected: an answer confirming the light is on. Click **Refresh** in **Lights** and confirm Living room is `on`.
3. Enter `turn off living room`. Expected: confirmation and Living room becomes `off` after refresh.
4. Enter `turn on bedroom`, then `status`. Expected: the status reply includes Bedroom as on.
5. Enter `turn off bedroom` to finish with both lights off.

Replies arrive through the streaming connection. Mock replies may finish too quickly to visibly inspect each text fragment. The send control should become available again after each reply.

## 4. Use the direct light controls

1. In **Lights**, click **On** for Living room.
2. Confirm the displayed state changes to `on`, and **Last control** reports the device operation as `succeeded`.
3. Click **Off** and confirm `off` and another successful last-control result.
4. Repeat for Bedroom.

These buttons use the direct control path and do not require an LLM response. Displayed states are snapshots; click **Refresh** when checking a state changed elsewhere.

### Check stored messages and restart behavior

Use a third terminal. This makes a separate HTTP conversation and returns its ID:

```sh
curl -sS -X POST http://localhost:3001/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"turn on living room"}'
```

1. Copy `conversationId` from the JSON response.
2. In your browser, open these URLs, replacing `YOUR_ID` with that actual ID:

   ```text
   http://localhost:3001/conversations/YOUR_ID/messages
   http://localhost:3001/conversations/YOUR_ID/audit
   ```

   Expected: the history contains the user command and assistant response; the audit contains the successful light operation.

3. In Terminal A, press **Ctrl-C**, then run `yarn dev:api` again.
4. Reload both inspection URLs. Expected: messages and audit remain stored.
5. Refresh the Aura page and its Lights panel. Expected: mock light states reset to off on API restart.

The browser chat view is session-only: reloading clears the visible conversation and starts a new UI session. The previous conversation is still accessible through its saved API URL. Keep the ID if you want to inspect it later.

## 5. Try browser voice with mock speech

Use a browser with microphone access on **localhost**, plus a working microphone and speaker/headphones.

1. Find **Talk to Aura**. Confirm it says recordings produce `status` and a reply tone.
2. Click **Start recording** and allow microphone access.
3. Speak briefly, then click **Stop and send**.
4. Expected: the microphone stops, the transcript is **status**, Aura returns device status, and a brief tone plays. Mock speech ignores your spoken words; it does not perform offline speech recognition.
5. If playback is blocked, click **Play reply**. Use the displayed **History** and **Audit** links to inspect the saved turn.
6. Start another recording and click **Discard recording**. Expected: no new chat turn is submitted.
7. Start another recording and let it reach 20 seconds. Expected: it automatically stops and submits one turn.
8. Deny microphone permission in browser site settings, then try recording. Expected: a helpful error. Restore permission and try again to confirm recovery.

If playback fails after a response, inspect history, audit, and light state before repeating an action. Stopping playback only stops the speaker; a submitted action can still complete.

## 6. Save, change, and delete a preference

1. Open **Settings → Approved preferences**. Memory starts off; **Enable memory** stays disabled until you approve using saved preferences.
2. Tick **I approve using saved preferences in new chat and voice turns.** and click **Enable memory**. Expected: the status updates immediately and **Disable memory** appears, without restarting the API.
3. In **Approved preferences**, select **Response language** and **Spanish**.
4. Confirm **Save approved preference** is disabled until you tick **I approve saving this preference until I delete it.**
5. Tick that box and click **Save approved preference**. Expected: the saved value `es` appears with an approval timestamp.
6. Send `show preferences` in chat. Expected: mock Aura reports the active saved value. Mock answers otherwise stay deterministic; this step does not prove real Spanish generation.
7. Save **English** in the same category, approving again. Expected: the existing language preference changes to `en`.
8. Restart the API and reload the page. Expected: the saved preference remains.
9. Click **Delete language**, then send `show preferences` again. Expected: that preference is absent from active memory.

You can repeat using **Response style** with **Concise** or **Detailed**. Click **Disable memory** when finished to stop applying preferences without deleting them. Send `show preferences` to confirm no values are active, then reload/restart to check that memory remains disabled.

## 7. Create and test an automation

Use simulated devices for this exercise. If you already have rules, inspect them and stop global execution before changing lights.

1. Set `AUTOMATIONS_ENABLED=true` and `AUTOMATION_POLL_MS=5000` in `.env`.
2. Restart the API and reload the page.
3. Click **Emergency stop all automations** so no existing rule can run while you prepare.
4. Use direct controls to turn both lights off. Wait **at least 10 seconds** so polling observes the baseline.
5. In **Automations**, fill in:

   | Field                            | Value                        |
   | -------------------------------- | ---------------------------- |
   | Rule name                        | Living room turns on bedroom |
   | When light changes               | Living room                  |
   | Trigger state                    | on                           |
   | Set light                        | Bedroom                      |
   | Action state                     | on                           |
   | Minimum seconds between attempts | 60                           |

6. Click **Create disabled rule**. Expected: the rule appears as **Disabled**.
7. Click **Dry run Living room turns on bedroom**. Expected: a matching simulated trigger result, with no light change or execution receipt. This tests a generated transition, not the current live light state.
8. Tick **I approve the next activation shown here.**, then click **Approve and enable Living room turns on bedroom**.
9. Tick the approval box again, then click **Enable automation execution**. Each activation clears the checkbox; rule approval and global execution are separate steps.
10. Turn Living room **On** using direct controls. Leave it on for at least **10 seconds**.
11. Click **Refresh** in Lights and **Refresh rules and receipts** in Automations. Expected: Bedroom is on, and a `succeeded` receipt appears. Open its **Audit** link to inspect the operation.
12. Click **Emergency stop all automations**. Turn both lights off, wait 10 seconds, turn Living room on, then wait another 10 seconds. Expected: Bedroom stays off and no new automation action starts.
13. Restart the API, reload the page, and confirm emergency stop remains on.
14. Delete your test rule, turn both lights off, then restore `AUTOMATIONS_ENABLED=false` and restart the API.

For repeat activation tests, wait at least 60 seconds between attempts and create a fresh off → on transition with time for polling to observe each state. Short transitions can be missed. Emergency stop cannot undo an operation already dispatched.

## 8. Optional: run the packaged app with Docker

This replaces the two-terminal source workflow. It also allows production app-shell/offline checks.

1. Stop `yarn dev:api` and `yarn dev:web` with **Ctrl-C**. Restore mock modes and disable automations in `.env`.
2. Check Docker:

   ```sh
   docker info
   ```

   If the daemon is unavailable, resume the existing default Colima profile:

   ```sh
   colima status
   colima start
   docker info
   ```

   Keep its existing configuration; other projects may share this runtime.

3. Build and start from the repository root:

   ```sh
   docker compose up --build -d --wait
   docker compose ps
   curl --fail http://localhost:3001/health
   ```

4. Open **http://localhost:8080** and repeat the chat, direct-control, and voice tests. Compose sets the browser origin for this URL automatically.
5. After editing `.env` for preferences/automations, apply changes with `docker compose up -d --wait` and reload the page. A plain container restart does not load changed environment values.
6. For persistence testing, use `docker compose restart api`, wait for health to recover, then inspect the saved history/audit URLs.

Docker uses a named SQLite volume, separate from source development's `./data/aura.sqlite`; histories from one workflow do not automatically appear in the other.

### Production offline shell check

1. Load http://localhost:8080 online, wait for service-worker registration, and reload once online so the page is controlled.
2. In browser developer tools, set the Network panel to **Offline**, then reload.
3. Expected: the cached app shell loads; chat and device requests fail while offline and are never queued.
4. Return Network to **Online** and reload. Confirm the app reconnects and no earlier offline operation executes automatically.

Installability varies by browser. If the browser offers installation, install and launch the app, then record its behavior. The Vite development workflow does not register this production service worker.

To stop only this project's stack while retaining its data:

```sh
docker compose down
```

Leave Colima running. Do not add `--volumes` when you want to preserve history.

## 9. Optional: use the local Home Assistant test installation

This runs actual Home Assistant with two simulated lights. Physical hardware is unnecessary. Use Docker as in section 8 and stop any source API using port 3001 first.

1. From the project root:

   ```sh
   yarn ha:up
   yarn ha:config:check
   yarn ha:setup
   ```

2. Setup stores local credentials in `.env.home-assistant.local`. Read that file privately to sign in; do not paste its secrets into chat or commit it. Setup reuses working saved credentials and refuses to reset an existing installation.
3. Before deploying, inspect that file. For an unpaid test, set `AGENT_MODE=mock`, `SPEECH_MODE=mock`, and `AUTOMATIONS_ENABLED=false`. Confirm the device backend is Home Assistant and the configured read/write grants refer only to the local test lights. Existing settings may enable paid modes from an earlier session.
4. Start Aura:

   ```sh
   yarn deploy:ha:local
   ```

5. Open **http://localhost:8080** for Aura and **http://localhost:8123** for Home Assistant. Sign in to HA using the saved local credentials.
6. In Aura, send `list devices`. Expected: the configured HA test lights are listed.
7. Send `turn on light.aura_living_room`. Confirm the state in both Aura and HA. Then send `turn off light.aura_living_room` and confirm off.
8. Repeat with `light.aura_bedroom` and test the direct On/Off buttons. **Last control** should report success.
9. Change a simulated light from Home Assistant, then click **Refresh** in Aura. Expected: Aura reflects the new observed state.

For changes to this deployment's environment, edit `.env.home-assistant.local` and rerun `yarn deploy:ha:local`. Its settings are separate from source development's `.env`. To return to the mock Docker app, restore mock settings in `.env` and run `docker compose up --build -d --wait` without the HA overlay.

See [Home Assistant deployment and recovery](deployment/home-assistant.md) before testing an existing home or physical devices.

## 10. Optional: real AI chat and speech

These tests make paid provider requests when you submit a turn. Keep simulated lights for your first test.

1. Edit the active server configuration: `.env` for source/base Compose, or `.env.home-assistant.local` for the HA deployment.
2. Set `OPENAI_API_KEY` to your own key privately. To test natural-language chat, set `AGENT_MODE=openai`; keep `DEVICE_BACKEND=mock` for simulated devices. Use the configured `OPENAI_MODEL` only if your account can access it.
3. Restart the source API or recreate the applicable Compose deployment, then reload the page. Confirm it reports an OpenAI agent.
4. Send “Which lights can you control?” and then “Please turn on the living room light.” Confirm the listed devices and observed state. Turn the light off afterward.
5. To test real speech, set `SPEECH_MODE=openai` and restart/recreate again. Agent and speech modes are independent; leaving the agent in mock mode still permits real recognition of its supported commands.
6. Record yourself saying “status”. Expected: a real transcript, a text response, and spoken reply rather than the mock tone.
7. With memory enabled through Settings or its API, save a Spanish language preference and send a new turn with the OpenAI agent. Check the answer language, then delete the test preference.
8. Restore `AGENT_MODE=mock` and `SPEECH_MODE=mock` and restart/recreate when finished.

Keys belong only in server configuration, never in `VITE_*` variables. Model/language/voice settings are listed in [.env.example](../.env.example). See [voice setup](deployment/voice.md) for speech configuration and recovery.

## 11. Optional: satellite and wake word

### macOS transport check without audio hardware

1. Keep the API running with mock agent and mock speech.
2. Generate a scoped token locally with `openssl rand -hex 32`.
3. Save it as `SATELLITE_TOKEN` in the active server configuration. Create private `.env.voice-satellite` containing the matching token and `AURA_API_URL=http://127.0.0.1:3001`. Protect the files with `chmod 600` and restart/recreate the API.
4. Run:

   ```sh
   yarn build
   yarn voice:once --fixture --no-playback
   ```

5. Expected: the fixture submits a status turn, prints transcript/response and a conversation ID, and exits. Inspect that conversation's history. This checks transport, not microphone, speaker, or wake detection.

### Linux/Pi deliberate voice and wake detection

1. Follow [Linux satellite setup](deployment/voice.md#linux-satellite) to install `alsa-utils`, configure the API connection/token, and select devices using `arecord -l` and `aplay -l`.
2. Build and run `yarn voice:once`. Speak after **Listening**, then pause. Expected: capture ends after silence, the microphone closes, and the reply plays before the process exits.
3. For wake testing, follow [wake setup](deployment/mvp4.md#wake-word-on-linuxpi), adding your own `PICOVOICE_ACCESS_KEY` and `WAKE_ENABLED=true` only to `.env.voice-satellite`.
4. Run `yarn voice:wake`. Expected: it starts muted.
5. Type `u` then Enter, say **Porcupine**, wait for the beep, then speak your command. Expected: one turn and reply; capture is closed during feedback/playback. A custom “Aura” wake model is not bundled.
6. Type `m` then Enter and wait for the muted status. Say the keyword again; no turn should start.
7. Type `q` then Enter to exit. After an audio/request error, inspect history/audit before deliberately unmuting and trying another action.

Record real hardware/audio results separately from fixture results. Pi audio quality, room-noise performance, wake accuracy, and latency require your own measurements.

## 12. Troubleshooting and daily use

| Symptom                                   | What to do                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Port already in use                       | Check for an existing Aura source process or Compose API. Use one startup workflow at a time.                             |
| Page stays Connecting or Disconnected     | Check `/health` and API logs. Confirm the exact localhost URL and `WEB_ORIGIN`, then reload after the API recovers.       |
| Docker cannot connect                     | Check `colima status`, start the existing profile if needed, then retry `docker info`.                                    |
| Docker startup fails                      | Run `docker compose logs api web` and inspect the reported error.                                                         |
| Configuration change has no effect        | Restart source API; recreate Compose services using the same env file/overlay used to start them.                         |
| Spoken words always become status         | This is expected in `SPEECH_MODE=mock`. Enable real speech to test recognition.                                           |
| Microphone unavailable                    | Use localhost or HTTPS, check site permissions and the OS input device, then start a new recording.                       |
| No spoken reply                           | Try Play reply if offered; inspect the text/history before repeating any device action.                                   |
| Preference or automation appears inactive | Enable its server flag and reload after restarting/recreating the API; automations also require rule and global approval. |
| Automation did not run                    | Check global stop, rule approval, cooldown, write grants, and receipts. Hold each source state long enough for polling.   |
| HA lights unavailable or read-only        | Check HA health, token, read allowlist, and explicit write grants. Do not expand grants just to clear an error.           |
| Old chat disappears after page reload     | The UI is session-only. Retrieve persisted messages using the saved conversation ID.                                      |
| Device outcome is pending/uncertain       | Inspect the audit and observed state before deciding whether to submit another action.                                    |

For daily source use, run `yarn dev:api` and `yarn dev:web`, then open localhost:5173. Stop each process with Ctrl-C. Rebuild shared packages with `yarn build` after changing shared source. For daily Docker use, run the applicable Compose startup command and open localhost:8080; use `docker compose down` to stop the base stack while preserving data.

## Test record

Record date, commit (`git rev-parse --short HEAD`), OS/browser, startup workflow, enabled modes, and any hardware used. Mark optional tests as **Skipped** when unavailable; they are not passes.

| Check                                            | Pass / Fail / Skipped | Notes or conversation ID |
| ------------------------------------------------ | --------------------- | ------------------------ |
| Startup and health                               |                       |                          |
| Typed chat and light status                      |                       |                          |
| Direct controls and successful audit             |                       |                          |
| History/audit survive API restart                |                       |                          |
| Browser recording and mock reply                 |                       |                          |
| Discard and automatic 20-second submission       |                       |                          |
| Microphone denial and recovery                   |                       |                          |
| Preference approval, edit, persistence, deletion |                       |                          |
| Automation dry-run and approved execution        |                       |                          |
| Emergency stop survives restart                  |                       |                          |
| Docker startup and production offline shell      |                       |                          |
| Local Home Assistant state agreement             |                       |                          |
| Live AI chat and real speech                     |                       |                          |
| Satellite transport fixture                      |                       |                          |
| Linux microphone/speaker and wake detection      |                       |                          |

Existing automated evidence is in [MVP3 verification](verification/mvp3.md) and [MVP4 verification](verification/mvp4.md). Add your observed browser/hardware results separately so fixtures and real acceptance remain distinguishable.
