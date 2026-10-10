# MVP 1 implementation plan

Implement one thin vertical slice: a user sends a chat message, the agent may invoke a narrow mock-light tool, the server authorizes that operation, and the response streams back while history and execution audit are stored in SQLite.

1. Verify official SDK documentation, runtime requirements, tool APIs, OpenAI provider APIs, and streaming events. Pin direct dependencies.
2. Scaffold Yarn workspaces, strict TypeScript, public package exports, and boundary checks.
3. Define pure domain ports; implement chat orchestration and a default-deny device policy through dependency injection.
4. Add SQLite/Drizzle repositories with a versioned initial migration. Store messages in insertion order and audit device attempts before execution.
5. Implement credential-free mock chat and mock devices. Isolate the real Strands/OpenAI adapter behind the same agent port.
6. Add Fastify HTTP chat, WebSocket streaming, healthcheck, structured logging, validated transport contracts, and a minimal React/Vite PWA shell.
7. Add behavior tests and integration tests, local setup instructions, and ARM64 Docker Compose configuration.

## Repository structure

```text
apps/
  api/src/                 Fastify routes, configuration, composition root
  web/src/                 React chat UI
  web/public/              Manifest and offline shell assets
  voice-satellite/src/     Reserved for MVP 3
packages/
  domain/src/              Pure entities, types, ports
  application/src/         ChatService, DeviceTools, authorization policy
  agent/src/               MockChatAgent and StrandsChatAgent
  integrations/src/        MockDeviceGateway and OpenAI model factory
  persistence/src/         Drizzle schema and SQLite repositories
  persistence/migrations/  Versioned SQL
  contracts/src/           Zod request, operation, and stream schemas
scripts/                   Dependency-free boundary verification
docs/                      Plan and SDK evidence
```

## Boundaries and ownership

Domain has no external dependencies. Application depends on domain ports and validated contracts. Agent depends on application tools, never on a concrete device adapter or database. Integrations and persistence implement domain ports. The API composition root chooses implementations and supplies IDs, clocks, authorization grants, and credentials. Web imports only contracts.

Package exports resolve compiled output. Build workspaces in dependency order before starting development; rebuild shared packages after editing them. This keeps runtime imports and production Node.js execution consistent without a bundler or extra monorepo framework.

## Acceptance checks

- Fresh mock startup needs no API key, Home Assistant, microphone, or Raspberry Pi.
- HTTP chat can change a mock light, persist both turns, and write an execution audit entry.
- WebSocket events arrive as `started`, text `delta` events, and `done`; failures produce `error`.
- Untrusted tool inputs fail validation; ungranted device IDs are denied before execution.
- SQLite data survives reopening; foreign keys prevent orphan records.
- Fixture SSE responses exercise the real Strands/OpenAI tool loop without external requests.
- Workspace boundary checks prevent domain/vendor coupling and server imports into web.

## Scope limits

Home Assistant and MQTT adapters, voice transport, push-to-talk, wake word, long-term memory, automation, and sensitive-action confirmation are later phases. The satellite workspace contains only a placeholder. All device changes are simulated. The single-user API binds to loopback by default; identity and remote access are outside this MVP. The browser caches only the app shell; device requests are never queued offline.
