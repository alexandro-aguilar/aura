# Architecture specification

## Package ownership

| Package         | Responsibility                                                         | Internal dependencies                  |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| domain          | Pure entities and ports                                                | None; no framework/vendor dependencies |
| contracts       | Runtime transport/tool schemas and inferred types                      | None                                   |
| application     | Chat orchestration, validation, authorization, audited execution       | domain, contracts                      |
| agent           | Deterministic mock and Strands agent, prompts and narrow tool bindings | domain, application, contracts         |
| integrations    | Mock/HA device gateways and OpenAI factory; future MQTT adapter        | domain                                 |
| persistence     | SQLite/Drizzle repositories and migrations                             | domain                                 |
| api             | Fastify HTTP/WS, configuration and composition root                    | All server packages and contracts      |
| web             | React/Vite PWA                                                         | contracts only                         |
| voice-satellite | Future audio transport and playback                                    | contracts only; currently placeholder  |

Use public compiled exports and dependency injection. The API supplies repositories, adapter selection, clocks, UUID generation, credentials and policy grants. Agent callbacks close over server conversation context; device operations accept neither conversation identity nor permission grants from the model. Verify these rules with `yarn check:boundaries`.

## Request and execution flow

1. HTTP or WebSocket transport parses and validates input.
2. ChatService creates or checks the conversation, acquires its in-process busy guard, loads prior messages and persists the user turn.
3. The selected agent streams text and may call narrow application tools.
4. DeviceTools validates operation arguments, authorizes the device, records pending, invokes the gateway and records the outcome. Valid but denied requests are audited as denied without gateway execution.
5. ChatService persists the complete assistant response before emitting done, then releases its guard even on failure.

An origin check protects browser requests but does not establish user identity. Requests without an Origin header are currently accepted. MVP1 is a trusted, single-user, loopback service; do not treat origin checks as authorization for a broader network deployment.

A single API process owns SQLite and the in-memory conversation guard. Multiple replicas, cross-process locking, durable request queues and exactly-once execution are not supported. Do not add them implicitly.

## Persistence contract

| Entity          | Stored fields                                                             | Invariants                                                               |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Conversation    | id, createdAt                                                             | Server-generated identity                                                |
| Message         | id, conversationId, role, content, createdAt; internal sequence           | Existing conversation; user/assistant roles; insertion-order retrieval   |
| Execution audit | id, conversationId, deviceId, state, status, createdAt; internal sequence | Existing conversation; on/off; pending/succeeded/denied/failed/uncertain |

Use versioned transactional migrations, foreign keys, WAL and a busy timeout. Do not use timestamps to order turns. Mock device state is in memory and resets on restart. The [MVP2 contract](mvp2.md) includes unavailable/unknown read states, observation timestamps and advisory canControl metadata; writes remain on/off. Schema migration 0002 preserves existing records while adding uncertain audit outcomes. Aliases, preferences, confirmation records and automation rules are future schema work, not existing tables.

Audit transitions are pending → succeeded/failed/uncertain, or a direct denied entry for policy rejection. Malformed tool arguments fail before a typed operation exists and currently create no execution audit. Gateway errors can leave pending if final audit persistence also fails. Pending therefore means outcome unknown; it must never be interpreted as safe to replay.

User-message persistence, physical execution and assistant persistence do not form one atomic transaction. A failed provider response may follow successful execution. Recover by inspecting device state and audit/history, not by automatically resubmitting a command.

## Configuration and operations

MVP1 configuration is `AGENT_MODE`, `DATABASE_PATH`, `HOST`, `PORT`, `WEB_ORIGIN`, `OPENAI_API_KEY` and `OPENAI_MODEL`. Mock is the default agent mode. OpenAI selection alone still uses mock devices. MVP2 adds independent `DEVICE_BACKEND=home-assistant` selection with server-only HA_URL/HA_TOKEN/HA_LIGHT_IDS/HA_TIMEOUT_MS, optional HA_WRITE_LIGHT_IDS and HA_CONFIRMATION_TIMEOUT_MS. Empty write grants preserve read-only behavior. Explicit write grants are a subset of the visible lights; selecting a provider cannot grant physical access. Direct controls use the same pending-first application execution path and per-light busy guard as agent tools. The adapter dispatches once and confirms observed state; uncertain outcomes never trigger automatic replay.

The health route probes SQLite and reports configuration without provider traffic. Fastify emits structured logs. Compose targets ARM64, runs the API as non-root, binds host ports to loopback and persists SQLite in a named volume. Use the existing Colima profile on macOS as directed by AGENTS.md.

Before each SDK integration, inspect current official documentation and package metadata, pin compatible direct versions, and update the compatibility evidence. This specification retains the existing stack; it does not propose a dependency upgrade.

## Device and future trust boundaries

Home Assistant credentials stay in a server adapter. Entity grants and direct-control requests pass through the same application policy and audit path as agent tools. Connection status and state freshness must remain distinct from provider availability.

Audio input is untrusted and subject to bounded size, duration and format validation. Voice clients transport audio and play output; the API owns STT/TTS credentials and all operations. Memory and event text are untrusted context, never new authorization. Confirmation must bind an exact operation to a trusted caller, expiry and single-use approval before any sensitive capability is enabled.
