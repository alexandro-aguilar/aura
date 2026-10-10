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

See [AGENTS.md](AGENTS.md) for implementation guardrails, [the MVP 1 plan](docs/implementation-plan.md) for package ownership, and [SDK compatibility evidence](docs/sdk-compatibility.md) for the verified API basis and outstanding runtime checks.

## MVP 1 scaffold

The scaffold contains a strict TypeScript Yarn monorepo, Fastify HTTP and WebSocket chat, a React/Vite PWA shell, SQLite/Drizzle conversation storage, and an audited mock-light tool. Default mock mode is deterministic and requires no API key, Home Assistant, Raspberry Pi, microphone, or speaker.

All devices remain simulated even when the OpenAI agent is enabled. Only the living room and bedroom lights are authorized. Home Assistant, MQTT, voice, and sensitive actions belong to subsequent MVPs.

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

Failures emit an `error` event with a public code and message. Failed turns retain the user message but do not store a partial assistant response. Requests within a conversation are serialized. A disconnected socket does not cancel an already accepted request: the server finishes it and persists the outcome. Check history and device state before retrying after a disconnect.

### Persistence and logging

The API creates `./data/aura.sqlite` on startup and applies the versioned initial migration transactionally. SQLite uses WAL, foreign keys, and a busy timeout. Messages and execution audit survive restarts. Mock device state resets on restart. Audit entries record `pending` before execution, then `succeeded` or `failed`; authorization failures record `denied`. A `pending` entry after interruption means the outcome requires inspection.

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

**Current verification status (2026-10-10):** `yarn check` passes workspace boundaries, the production build, strict type checks, and all 19 tests across four suites, including the real Strands tool loop with fixture OpenAI responses. The required `@modelcontextprotocol/client` peer is installed and `yarn.lock` is refreshed; `yarn install --immutable` passes. Formatting and Docker Compose configuration checks also pass. Both ARM64 Docker images build and run under Colima. Container checks pass for API health, nginx app/PWA asset serving, HTTP chat, proxied WebSocket streaming, mock light state, request validation, origin enforcement, and persisted conversation history and execution audit after an API restart. SQLite integrity and foreign-key checks pass; the API runs as the non-root Node user. Live OpenAI requests have not been tested. Commit `yarn.lock` and use `yarn install --immutable` for reproducible installs. See the compatibility record for details.

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

Open **http://localhost:8080**. Both images target `linux/arm64`; x64 development hosts need Docker ARM emulation or a local platform override. SQLite is stored in the `aura-data` named volume. The API has a healthcheck, runs as the Node user, and receives secrets at runtime. The web image serves static assets and proxies `/api` through nginx. Local ports bind to loopback.

The PWA manifest and production service worker cache the app shell. Chat and device operations require the API and are never cached or queued for later execution. The browser conversation view is session-only; persisted history is available through the API. Remote access, authentication, broader device control, and cross-browser PWA packaging validation are outside this scaffold.
