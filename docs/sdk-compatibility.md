# Strands compatibility evidence

Reviewed 2026-10-10 before writing the Strands adapter.

## Official sources

- [TypeScript quickstart](https://strandsagents.com/docs/user-guide/sdk/quickstart/typescript/): Node.js 22+, ESM, `Agent`, and `OpenAIModel` from `@strands-agents/sdk/models/openai`.
- [TypeScript v1.20.0 release](https://github.com/strands-agents/harness-sdk/releases/tag/typescript/v1.20.0): released 2026-10-08, selected as the exact SDK pin.
- [Current SDK package metadata](https://raw.githubusercontent.com/strands-agents/harness-sdk/main/strands-ts/package.json): Node >=22; OpenAI peer `^6.45.0`; Zod peer `^4.1.12`; OpenTelemetry API peer `^1.9.0`; dedicated OpenAI export. Main uses a development version placeholder and is not a registry version.
- [Tool API](https://strandsagents.com/docs/user-guide/sdk/tools/): `tool({ name, description, inputSchema, callback })` with Zod runtime validation.
- [Streaming](https://strandsagents.com/docs/user-guide/sdk/streaming/): `agent.stream()` returns an async event iterator; text arrives under `modelStreamUpdateEvent → modelContentBlockDeltaEvent → textDelta`.
- [Agent source at v1.20.0](https://raw.githubusercontent.com/strands-agents/harness-sdk/typescript/v1.20.0/strands-ts/src/agent/agent.ts): history through `messages`, `printer: false`, sequential tool executor, and `shutdown()` cleanup.
- [Message types](https://raw.githubusercontent.com/strands-agents/harness-sdk/main/strands-ts/src/types/messages.ts): `{ role, content: [{ text }] }` history format.
- [Original TypeScript repository](https://github.com/strands-agents/sdk-typescript): archived and directs development to the harness SDK monorepo. Package name remains `@strands-agents/sdk`.
- [Node release schedule](https://github.com/nodejs/Release): Node 24 is the active LTS line on the review date. Local runtime was Node 24.18.0.

The chosen direct pins are SDK `1.20.0`, OpenAI `6.45.0`, Zod `4.1.12`, OpenTelemetry API `1.9.0`, and MCP client `2.0.0`. Both server workspaces consuming the SDK supply the same peers to avoid separate peer environments. The MCP client is required by Strands' Node entry point even when the application registers no MCP servers. Versions of the remaining stack are pinned in their workspace manifests.

## Implementation

The provider explicitly uses `api: 'chat'`. The model ID comes from server-only configuration. Each turn creates an agent with persisted text history and tool callbacks closed over a server-assigned conversation ID. Neither conversation identity nor authorization grants are tool arguments. Each callback delegates to the same application use case used in local mock mode. The adapter forwards only text deltas and cleans up its agent afterward.

No unrestricted Home Assistant service tool, shell tool, filesystem tool, or MCP server is registered.

## Installed artifact verification

The user installed the dependencies and generated `yarn.lock`. Inspection of the installed v1.20.0 artifact confirmed Node >=22, OpenAI `^6.45.0`, Zod `^4.1.12`, OpenTelemetry API `^1.9.0`, and MCP client `^2.0.0` requirements. The production build and strict type checks pass against the installed SDK. A persistence declaration-emission error was fixed by giving the repository factory an explicit public return type.

After refreshing the install, the required `@modelcontextprotocol/client` peer is installed in both SDK workspaces and recorded in `yarn.lock`. `yarn install --immutable` passes. `yarn check` passes workspace boundaries, the production build, strict type checks, and all 19 tests across four suites.

The fixture test at `packages/agent/src/strands.test.ts` now passes: it runs the actual installed SDK, receives a fixture OpenAI tool call, executes an authorized light operation, sends the tool result through the SDK, and consumes the final response. It requires no real API key or provider traffic. Live provider traffic has not been tested.

Formatting, workspace boundaries, and Docker Compose configuration checks pass. Both `linux/arm64` images build with immutable installs and run under Colima. Runtime checks pass for health, nginx app/PWA asset serving, HTTP chat, proxied WebSocket streaming, mock light operations, request validation, and origin enforcement. Conversation history and successful device execution audit entries survive an API container restart; SQLite integrity and foreign-key checks pass. The API runs as the non-root Node user. Docker now uses immutable installs against the lockfile.

## Read-only MVP2 tool configuration

The first Home Assistant slice retains the same SDK/dependency pins. Official [Strands tool documentation](https://strandsagents.com/docs/user-guide/sdk/tools/) was rechecked on 2026-10-10; the installed SDK remains the runtime basis. Read-only mode changes the prompt and registers only list_devices. The actual SDK fixture now covers both mock writes and read-only discovery. This does not imply a live-provider test. See [MVP2 verification](verification/mvp2-read-only.md) for the historical 59-test result and [Home Assistant API decisions](specs/mvp2-read-only.md) for the separate REST adapter.

## Full MVP2 verification

Official HA REST/authentication and Strands tool documentation were rechecked on 2026-10-10. Existing application SDK/dependency pins remain unchanged. The current check passes 87 tests across seven suites. Four actual installed-SDK fixture scenarios cover mock writes, read-only discovery, HA wording/write dispatch and a model retry attempt blocked by the per-turn same-light guard. No live OpenAI request was made.

Home Assistant Container 2026.10.1 is installed and validated on this Mac with simulated template lights through the real REST API. HTTP chat, WebSocket chat and direct writes, audit/history restart durability and HA outage/recovery pass. See [current MVP2 evidence](verification/mvp2.md) and [deployment decisions](deployment/home-assistant.md). Raspberry Pi and physical devices remain deferred.

## Live OpenAI follow-up

The user supplied server-only OpenAI configuration on 2026-10-10. Four live gpt-5.4 chat turns passed through the pinned Strands/OpenAI adapter: discovery, authorized on, streamed off, conversation recall and model refusal of an ungranted light. Actual HA state, two succeeded write audits and eight ordered persisted messages were checked. No SDK or production-code changes were required. See [live acceptance evidence](verification/mvp2.md#live-openai-acceptance). Earlier no-live-provider statements describe their original fixture-only checkpoints.
