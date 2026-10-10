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
