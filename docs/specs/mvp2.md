# MVP2 specification — authorized Home Assistant lights

Status: software and local deployment implemented. The user explicitly selected macOS Home Assistant validation and deferred Raspberry Pi testing until hardware is available. See [verification](../verification/mvp2.md). This phase covers P-06/P-07 and S-01–08; it introduces no new application dependency and no voice, MQTT or sensitive-device capability.

## Configuration and trust

Agent and device modes are independent. Mock devices remain the default. `HA_LIGHT_IDS` selects visible lights; `HA_WRITE_LIGHT_IDS` is a distinct, optional subset granting on/off execution. Empty write grants are read-only. Both application policy and adapter enforce grants; model/user arguments cannot supply services, grants, URLs or credentials. Device listings expose advisory canControl metadata, not authorization tokens.

Use the existing single trusted local operator model with loopback host bindings. Remote use in MVP2 goes through authenticated encrypted SSH tunnels, preserving localhost browser origin. Direct LAN/public exposure is not enabled. The separate local Home Assistant instance has its own authenticated account and token. HA credentials stay in the API; generated local credentials are mode-600 and excluded from Git and image builds.

## API and execution contract

| Route                          | Contract                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| GET /devices                   | Allowed light snapshots: id/name/state, observedAt for HA, canControl; on/off/unavailable/unknown remain distinct |
| POST /device-operations        | Strict JSON deviceId + on/off state + optional UUID conversationId; validates before execution                    |
| GET /conversations/:id/audit   | Insertion-ordered execution attempts and outcomes; unknown context returns 404                                    |
| POST /chat and WS /chat/stream | Existing conversation protocol; narrow tools use the same application boundary                                    |
| GET /health                    | SQLite/configuration health only; no HA/provider traffic                                                          |

Direct success is `{operationId, conversationId, device}` after desired state observation and audit finalization. Direct failure is sanitized `{code, message, conversationId?, operationId?, observedDevice?}`. HTTP codes: 400 malformed request; 404 missing conversation; 403 denied/read-only; 409 busy/not-ready/uncertain; 503 upstream availability/auth/response failure; 502 other execution/storage failures. Existing chat error/status behavior remains compatible with MVP1.

A new direct request gets a server-created conversation for its audit; no synthetic chat messages are inserted. A supplied context must exist. Direct requests never invoke the agent or require a provider response. After disconnect, accepted HTTP/WS work may finish; there is no safe automatic replay or exactly-once delivery contract.

Execution order: validate → authorize → persist pending audit → acquire in-process device guard → check current state → send one narrow HA service call → bounded observation reads → finalize audit. Denied operations record denied and never reach the adapter. Competing requests for the same device fail BUSY; no queue or retry is introduced. Other lights can progress independently. This remains a single API process deployment.

HA service response bodies are not evidence of the target's state. Only fresh entity reads can confirm the requested on/off state. An unavailable/unknown/missing light fails before dispatch. Definite 400/401/403/404 rejection fails without retry. A transport error or server failure after dispatch, failed reconciliation, or failure to observe requested state becomes OPERATION_UNCERTAIN. One inspection read follows uncertain dispatch; successful service responses may poll state until the confirmation deadline. There are never repeated POSTs within an operation.

Audit states: pending → succeeded/failed/uncertain; denied is recorded directly for policy rejection. Uncertain records possible execution with unconfirmed outcome. Pending after interruption/finalization failure also requires inspection. SQLite migration 0002 preserves v1 conversations, messages, audit IDs and insertion order while adding uncertain. Restart does not replay entries.

The agent exposes set_light only when grants exist, uses real-device wording in HA mode and blocks a second attempt for the same light within a turn. Deterministic chat accepts `turn on/off light.entity_id`; default mock room commands remain compatible. The PWA has separate on/off buttons, disables unavailable/unknown entities, refreshes state after operations/errors and shows the most recent direct audit. It works independently of chat socket/provider availability and never caches or queues operation requests.

## Acceptance matrix

| ID    | Required evidence                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------ |
| M2-01 | Explicit separate read/write grants, default deny, strict input and no generic service dispatch        |
| M2-02 | Adapter maps all read states, rejects malformed/mismatched responses and bounds requests               |
| M2-03 | Only one service POST, observed-state confirmation, delayed propagation and uncertain-outcome coverage |
| M2-04 | Agent and direct paths share grants/audit; direct path succeeds despite provider failure               |
| M2-05 | Pending precedes side effects; storage failures stop execution; concurrency cannot race the same light |
| M2-06 | Existing schema upgrades safely; audit/history persist after restart without replay                    |
| M2-07 | Actual local HA template-light operations work through HTTP, WS and direct routes                      |
| M2-08 | HA outage produces clear failure and recovery without changing the API configuration                   |
| M2-09 | Reproducible ARM64 Compose, health, server-only secrets, local onboarding and recovery instructions    |

The separate local deployment pins Home Assistant 2026.10.1 and uses two template lights backed by input booleans; testing those invokes real HA service APIs but no physical hardware. Keep historical [read-only slice evidence](../verification/mvp2-read-only.md) distinct from current acceptance. Raspberry Pi resource measurements, physical light integration and browser visual/offline/installability checks remain explicit platform acceptance items.
