# Home Intelligence Agent

Goal: Raspberry Pi 5 home intelligence assistant using TypeScript, Strands Agents, OpenAI, Home Assistant, React PWA, and a physical voice satellite.

## Decisions

- Monorepo: Yarn workspaces, TypeScript strict.
- API: Fastify with WebSocket streaming.
- Agent: Strands Agents SDK with OpenAI model provider; verify current SDK API before coding.
- Home control: Home Assistant via REST/WebSocket, behind narrow authorized tools.
- UI: React/Vite PWA for chat, devices and push-to-talk.
- Voice: physical USB microphone/speaker satellite; start with VAD → STT → agent → TTS.
- Data: SQLite with Drizzle; conversations, messages, aliases, execution audit, preferences.
- Deploy: ARM64 Docker Compose on Raspberry Pi 5 8GB + SSD; Home Assistant and optional Mosquitto separately.
- Security: no cloud keys in clients; require confirmation for sensitive actions; local controls must work if LLM unavailable.

## Roadmap

1. MVP1: monorepo, agent chat, streaming, SQLite, mocked devices, tests.
2. MVP2: Home Assistant deployment and device adapter.
3. MVP3: voice satellite and PWA push-to-talk.
4. MVP4: wake word, memory, event-driven automations.

See [AGENTS.md](AGENTS.md) for implementation guardrails, [project specifications](docs/specs/README.md) for requirements and architecture, [the delivery plan](docs/implementation-plan.md) for phase order and acceptance gates, and [SDK compatibility evidence](docs/sdk-compatibility.md) for the verified API basis and outstanding runtime checks.

## MVP1 through MVP4

The scaffold contains a strict TypeScript Yarn monorepo, Fastify HTTP and WebSocket chat, a React/Vite PWA shell, SQLite/Drizzle conversation storage, and an audited mock-light tool. Default mock mode is deterministic and requires no API key, Home Assistant, Raspberry Pi, microphone, or speaker.

Devices are simulated by default, including when the OpenAI agent is enabled. MVP2 adds an independently configured Home Assistant backend, explicit light write grants, observed-state confirmation, durable execution audit and direct controls that require no LLM. Home Assistant is installed separately; a local test installation uses simulated template lights. MVP3 adds deliberate browser recording and a one-turn Linux voice satellite; MVP4 adds optional local Porcupine wake listening, explicitly approved preferences and deterministic light automations; all three are independently disabled by default. MQTT and sensitive actions remain later work. See [voice setup and recovery](docs/deployment/voice.md) and [MVP3 verification](docs/verification/mvp3.md).

### Local setup

Use Node.js 24 LTS and Yarn 4.13.0. Enable Corepack if your Node installation provides it (`corepack enable`), or install the pinned Yarn release through your existing package manager setup.

```sh
yarn install
cp .env.example .env
yarn check
```

In two terminals, from the repository root:

```sh
yarn dev:api
```

```sh
yarn dev:web
```

Open **http://localhost:5173**. The API listens on **http://127.0.0.1:3001**. Vite proxies `/api` HTTP and WebSocket requests to it. Use `localhost` for the browser URL so its origin matches the default `WEB_ORIGIN`; set that variable if you use another browser origin.

The initial `yarn check` builds shared packages. After editing shared package source, run `yarn build` again. The API watch process watches its source; the UI uses Vite. To run the compiled API, use `node --env-file-if-exists=.env apps/api/dist/main.js` after building.

### Try the slice

Send `list devices`, `turn on living room`, `turn off living room`, `turn on bedroom`, or `status`. These are the deterministic commands supported in mock mode.

```sh
curl http://127.0.0.1:3001/health
curl -X POST http://127.0.0.1:3001/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"turn on living room"}'
```

The chat response contains `conversationId` and `message`. Include that ID in the next request to continue a conversation. Retrieve stored turns with `GET /conversations/:id/messages`. `GET /devices` returns the simulated device states.

For streaming, connect to `ws://127.0.0.1:3001/chat/stream` and send the same JSON body. The server emits:

```json
{"type":"started","conversationId":"<server-assigned-uuid>"}
{"type":"delta","text":"Living "}
{"type":"done","conversationId":"<server-assigned-uuid>","message":"Living room light is on (mock)."}
```

Failures emit an `error` event with a public code and message. Failed turns retain the user message but do not store a partial assistant response. Only one request per conversation can run at a time; overlapping requests are rejected with `BUSY` rather than queued. A disconnected socket does not cancel an already accepted request: the server finishes it and persists the outcome. Check history and device state before retrying after a disconnect.

### Persistence and logging

The API creates `./data/aura.sqlite` on startup and applies the versioned initial migration transactionally. SQLite uses WAL, foreign keys, and a busy timeout. Messages and execution audit survive restarts. Mock device state resets on restart. Audit entries record `pending` before execution, then `succeeded`, `failed` or `uncertain`; authorization failures record `denied`. Uncertain means a dispatched write may have completed without a confirmed outcome. The transactional version-2 migration preserves existing history and audit records. A `pending` entry after interruption means the outcome requires inspection.

Fastify writes structured logs to stdout. Request content and environment variables are not logged explicitly. Provider failures are logged server-side; clients receive a generic error. `/health` checks SQLite and reports the configured agent mode; it does not make a paid provider request.

### Optional Strands/OpenAI mode

The adapter follows the current official Strands API and pins SDK `1.20.0`. See [the compatibility record](docs/sdk-compatibility.md). Once `yarn check` passes, edit the server-only `.env`:

```dotenv
AGENT_MODE=openai
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-5.4
```

Restart the API. Select a tool-capable model your account can access. Live requests incur provider charges. Keep credentials server-only; never place them in `VITE_*` variables or the web workspace. Mock mode remains available when the provider is unavailable; it is an explicit configuration choice rather than an automatic retry of a device operation.

### Verification

```sh
yarn check:boundaries
yarn build
yarn typecheck
yarn test
yarn format:check
```

The tests cover application validation and authorization, audit ordering and failures, chat history and concurrency, SQLite durability and foreign keys, HTTP chat, WebSocket streaming, configuration, and the real Strands tool loop using fixture OpenAI SSE responses. Tests use temporary/in-memory databases and no cloud credentials or Home Assistant.

**Verification evidence:** [MVP1 closure](docs/verification/mvp1-closure.md) records the 24-test baseline and successful ARM64 container/restart checks. [MVP2 verification](docs/verification/mvp2.md) records current checks against the real local Home Assistant container and its simulated lights. Live OpenAI validation with the configured gpt-5.4 model passed against local HA test lights. Physical Raspberry Pi/device operation remains untested; Raspberry Pi acceptance is deferred until hardware is supplied. Commit `yarn.lock` and use `yarn install --immutable` for reproducible installs.

### Local Home Assistant on macOS

Home Assistant runs in a separate ARM64 container under the existing Colima profile, bound to **http://localhost:8123**. The provided configuration creates only two simulated template lights backed by input booleans. No physical integrations, privileged mode or hardware mounts are required.

For a fresh installation, run:

```sh
yarn ha:up
yarn ha:config:check
yarn ha:setup
yarn deploy:ha:local
yarn verify:ha:local --resilience
```

Setup creates the local `aura_local` account and saves its random password and API token to **`.env.home-assistant.local`** with mode 600. The file is ignored by Git, formatting and Docker build context. Read that local file to sign in; never paste it into chat or commit it. Setup is idempotent when its saved credentials work; it refuses to reset an existing installation or overwrite an incomplete credentials file.

Open Aura at **http://localhost:8080**. Its Lights panel can turn granted lights on/off even if chat is disconnected or the LLM fails. It shows snapshot times, failures and the last direct-operation audit. Use `list devices`, `turn on light.aura_living_room` or `turn off light.aura_bedroom` for deterministic chat without OpenAI. Test commands affect only the simulated Home Assistant lights.

`verify:ha:local --resilience` changes the test lights, restarts Aura's API and briefly stops/restarts this project's Home Assistant to test recovery. It preserves both data volumes and leaves the stack running. See the [deployment and recovery guide](docs/deployment/home-assistant.md).

For local source development against this installation, first `yarn build`, then run `yarn dev:api:ha:local` and `yarn dev:web` in separate terminals. Stop this project's Compose API/web first if they occupy port 3001; leave Home Assistant running. The development command uses the host's loopback HA URL, while Compose uses its private Docker network.

### Live OpenAI validation

With AGENT_MODE=openai, OPENAI_API_KEY and OPENAI_MODEL set in the private .env.home-assistant.local file, recreate the local API and run:

```sh
docker compose --env-file .env.home-assistant.local -f compose.yaml -f compose.home-assistant.yaml up -d --wait
yarn verify:openai:local --live
```

The explicit --live flag authorizes paid provider requests. The check makes four chat turns (tool loops may require multiple provider calls): allowed-light discovery, HTTP on with conversation recall, streamed off and an ungranted-light request. It verifies actual HA state, audit and persisted history, plus direct controls. It refuses an arbitrary HA home and leaves the tested light off on success. On failure, inspect its state/audit before deciding to retry. This script is separate from the deterministic, credential-free test suite and the mock-agent HA smoke check.

### Connect an existing Home Assistant instance

Configure server-only `.env` independently of `AGENT_MODE`:

```dotenv
DEVICE_BACKEND=home-assistant
HA_URL=http://homeassistant.local:8123
HA_TOKEN=your-long-lived-access-token
HA_LIGHT_IDS=light.kitchen,light.office
HA_WRITE_LIGHT_IDS=light.kitchen
HA_TIMEOUT_MS=5000
HA_CONFIRMATION_TIMEOUT_MS=3000
```

Obtain the token through your Home Assistant profile as described in the [official REST API documentation](https://developers.home-assistant.io/docs/api/rest/). The URL must be an HTTP(S) origin without embedded credentials, paths, queries or fragments. The read allowlist must contain 1–32 unique `light.*` IDs. Write grants must be an explicit subset; leaving `HA_WRITE_LIGHT_IDS` empty preserves read-only behavior. Only on/off is supported. Use HTTPS across untrusted networks. Keep tokens out of `VITE_*` variables and client code.

Restart the API or recreate Compose services after changing grants/credentials. When using an existing LAN instance, run the base Compose file with its reachable HA URL; the local overlay is only for the separately managed test container. Aura remains bound to loopback. The [deployment guide](docs/deployment/home-assistant.md) specifies authenticated SSH tunnels for remote access until household authentication/TLS are separately designed.

Each listing uses fresh REST reads; unknown/unavailable remain distinct from off. Observation time describes the API snapshot, not physical device reporting freshness. A write checks entity availability, sends exactly one `light.turn_on`/`light.turn_off` request and performs bounded reads to confirm the requested state. Interrupted dispatch, server errors or unconfirmed state produce an uncertain outcome; they never trigger automatic write retries. The Strands agent permits at most one write attempt per light per chat turn.

Direct API controls use the same validation, grants and audit path as agent tools:

```sh
curl -X POST http://127.0.0.1:3001/device-operations \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"light.kitchen","state":"on"}'
```

Success returns `operationId`, `conversationId` and the observed `device`. An optional existing conversationId can associate the audit with a chat. Inspect `GET /conversations/:id/audit` and `GET /devices` after failure or disconnect before deciding to retry. The PWA never queues operations offline. Health checks SQLite without contacting HA or a paid provider; device listing reports separate upstream failures.

Return `DEVICE_BACKEND=mock` and recreate the base stack to restore simulated controls. If using the local HA env file, run the base stack without that env file/overlay to return to defaults. Existing audits remain intact.

### Deliberate voice (MVP3)

The PWA now has **Talk to Aura**: Start recording → Stop and send → recognition → existing chat/tools → playback. Discard sends nothing; recording automatically stops/sends at 20 seconds. Use localhost or HTTPS for microphone access. Default mock speech always recognizes `status` and plays a tone, requiring no API key or Pi. Real recognition/playback uses server-only `SPEECH_MODE=openai`, independent of agent/device modes; see `.env.example` and [the voice guide](docs/deployment/voice.md).

The Linux satellite uses host `alsa-utils` and Node 24. Put only its scoped SATELLITE_TOKEN and audio/API settings in private `.env.voice-satellite`, build, then run `yarn voice:once`. It captures a single deliberate turn, ends on silence, closes the microphone before playback, and exits. `yarn voice:once --fixture --no-playback` exercises transport on macOS against mock speech/agent modes. `yarn verify:voice` checks the running mock voice API and persisted text without paid requests. Setup, token generation, SSH access, supported WAV limits and recovery are documented in [the voice guide](docs/deployment/voice.md).

Voice uses the same device grants and audit as typed chat. A submitted action may finish after disconnect or stopped playback: inspect conversation history/audit and device state before resubmitting. Audio stays in transient buffers; transcripts/answers persist. No audio or operations are queued offline. Actual browser/live speech and Pi/USB acceptance remain open; [MVP3 evidence](docs/verification/mvp3.md) distinguishes fixtures and ARM64 container checks from hardware validation.

### Advanced capabilities (MVP4)

Memory and automations are implemented behind independent `MEMORY_ENABLED=false` and `AUTOMATIONS_ENABLED=false` server flags. The PWA supports approved language/style preferences with inspect/edit/delete, plus disabled-by-default light-transition rules, dry-run, explicit activation, receipts and emergency stop. Mock `show preferences` reports active memory. Automations use existing snapshots and the same grants/audit as direct controls; no MQTT or LLM rule activation is needed.

The optional Linux wake CLI is `yarn voice:wake`. It needs `WAKE_ENABLED=true` and your own `PICOVOICE_ACCESS_KEY` in private `.env.voice-satellite`; starts muted; uses `u`/`m`/`q` plus Enter; and defaults to the keyword **Porcupine**. No AccessKey is needed for fixture tests. Enable and accept one capability at a time. See [MVP4 setup/recovery](docs/deployment/mvp4.md), [contracts](docs/specs/mvp4.md) and [verification](docs/verification/mvp4.md). Pi wake accuracy/echo and existing browser/live speech acceptance remain open.

### Docker Compose (ARM64)

On macOS, use the existing Colima Docker runtime. If `docker info` cannot connect, check its status and start it:

```sh
colima status
colima start
docker info
```

`colima start` resumes the default profile with its existing configuration. The repository's [agent instructions](AGENTS.md#local-docker-runtime-macos) authorize starting it when Docker validation requires it. Sandbox permissions may still require approval to access Colima's files outside the workspace. Leave Colima running for other projects that may use it.

From the repository root, build and start the app:

```sh
docker compose up --build
```

For background validation, use `docker compose up --build -d --wait`, then `docker compose ps` and `curl --fail http://localhost:3001/health`. Inspect failures with `docker compose logs api web`. To remove this project's containers while retaining SQLite data, run `docker compose down` without `--volumes`.

Run the repeatable mock smoke checks after startup:

```sh
yarn verify:compose
# Also restart this project's API and verify durable history/audit:
yarn verify:compose --restart
```

These checks create test conversations/audits and change simulated mock lights. The restart option briefly interrupts this project's API and resets mock devices. The script refuses to operate unless health reports both a mock agent and mock devices.

Open **http://localhost:8080**. Both images target `linux/arm64`; x64 development hosts need Docker ARM emulation or a local platform override. SQLite is stored in the `aura-data` named volume. The API has a healthcheck, runs as the Node user, and receives secrets at runtime. The web image serves static assets and proxies `/api` through nginx. Local ports bind to loopback.

The PWA manifest and production service worker cache the app shell. Chat and device operations require the API and are never cached or queued for later execution. The browser conversation view is session-only; persisted history is available through the API. Household authentication, public/LAN exposure, broader device capabilities and cross-browser PWA packaging validation remain outside these MVPs.
