# MVP2 verification — local Home Assistant

Date: 2026-10-10. Base commit: d48a0564700356d447f8c276dc0ad7fcd7f74e5f, with the MVP2 working-tree changes. Platform: macOS, Node 24.18.0, Yarn 4.13.0, existing Colima aarch64 profile. No Colima resources/profile changes were made. The user explicitly requested HA installation on this Mac and deferred Raspberry Pi testing.

## Automated acceptance

- `yarn install --immutable`: passed; no new application dependencies or SDK upgrades.
- `yarn check`: passed workspace boundaries, production build, strict TypeScript and **87 tests across seven suites**.
- `yarn format:check` and `git diff --check`: passed after final documentation formatting.
- Adapter fixtures cover allowed reads/writes, four read states, malformed/mismatched upstream data, missing entities, token rejection, network errors/timeouts, delayed state propagation and uncertain outcomes without repeated service POSTs.
- Application/API tests cover shared direct/agent authorization, strict input/origin checks, pending-before-side-effect, storage failures, same-light concurrency, provider-independent direct control, uncertain receipts and durable audit/history.
- Persistence tests upgrade v1 to v2, preserving IDs and insertion order; SQLite integrity and foreign-key checks pass. Four actual Strands SDK fixture loops cover both backend modes, read-only tools and model retry prevention.

## ARM64 runtime acceptance

`docker info` confirmed the existing Colima daemon. API/web images rebuilt successfully with `docker compose up --build -d --wait`; both services became healthy. `yarn verify:compose --restart` passed against the default mock backend, including direct/denied operations and durable history/audit after API restart.

Before applying schema v2 in the container, SQLite's backup API created `/app/data/aura-backup-1791656499619.sqlite` in the persistent Aura data volume. This preserves the previous database without unsafe live-WAL copying.

The separate HA deployment uses image `ghcr.io/home-assistant/home-assistant:2026.10.1`, inspected as linux/arm64, digest `sha256:130241f28d01fa80dfa3b44f7d89781c188d8642ecab9024f079f19f9f82baa0`. `yarn ha:up` and `yarn ha:config:check` passed. `yarn ha:setup` completed onboarding and a rerun validated the existing saved credentials without replacing them.

The generated server-only `.env.home-assistant.local` has mode 600 and is ignored by Git, formatting and Docker build context. The file was confirmed absent from the API image. No credential values were printed or supplied to the web app. HA ports and Aura ports bind to loopback; no physical mounts or privileged mode are enabled.

The HA Compose overlay started healthy. **`yarn verify:ha:local --resilience` passed** against the real local instance and its two template lights:

1. Fresh device snapshots identified exactly the granted test lights.
2. Direct living-room on confirmed actual HA state and a succeeded audit.
3. HTTP chat living-room off persisted its response and used real HA wording.
4. WebSocket chat bedroom on confirmed actual HA state.
5. An ungranted entity returned forbidden and a denied audit without dispatch.
6. API restart preserved chat history and execution audit.
7. Stopping HA left `/health` available while device listing/direct controls failed clearly; the failed operation was audited.
8. Restarting HA restored reads and controls without changing API configuration. Both test lights ended off and all services remained running.

These are real Home Assistant service/state calls to simulated template lights backed by input booleans. They do not certify physical-device operation. Provider-failure independence is additionally tested with injected failing agents; this local runtime used AGENT_MODE=mock and DEVICE_BACKEND=home-assistant and made no paid model requests.

## Remaining platform checks

No in-app browser was available (browser discovery returned an empty list). Visual UI interaction, offline shell behavior, browser installation and cross-browser acceptance remain unverified. Production assets/build and transport/API behavior are covered separately.

No Raspberry Pi, physical lights, microphone or speaker was used. Live OpenAI was subsequently validated as recorded below. Pi deployment/resource/SSD measurements and physical integration acceptance are deferred until hardware is supplied. Voice, MQTT, memory and automations remain later phases. Follow the [deployment guide](../deployment/home-assistant.md) when hardware is available.

## Live OpenAI acceptance

On 2026-10-10 the user supplied OpenAI configuration through the private local env file. The API was recreated without rebuilding images and health reported mode=openai, devices=home-assistant. No credential values were printed. `node --env-file=.env.home-assistant.local scripts/verify-openai-local.mjs --live` passed using the configured **gpt-5.4** model and existing Strands SDK.

Four live chat turns verified:

1. HTTP discovery returned both exact allowed HA light IDs without any write audit.
2. HTTP on executed light.aura_living_room once, confirmed HA state and a succeeded audit, and recalled a random marker from the preceding turn.
3. WebSocket off delivered started/text deltas/done with matching text, confirmed HA off and a second succeeded audit.
4. The model declined light.ungranted without dispatching a tool or producing a successful write audit. Enforcement of a forced denied tool attempt is covered by the separate application/fixture tests, not inferred from this model refusal.

Eight user/assistant messages were persisted in order. A direct control request also succeeded while the live provider was configured. The tested light ended off; Aura remains in the user's configured OpenAI mode. Tool loops may make more provider API calls than the four chat turns. Exact billed usage/cost was not measured. No provider outage or live ambiguous-write scenario was induced during this run.

The repeatable command is `yarn verify:openai:local --live`; it requires the explicit paid-request flag and validates the isolated local HA home before operations. Visual browser and physical hardware limitations above remain unchanged.
