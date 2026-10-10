# MVP1 behavior specification

Status: existing implementation baseline inspected on 2026-10-10. Acceptance evidence must be refreshed using the [closure plan](../plans/mvp1.md). This specification does not certify live OpenAI or physical Raspberry Pi operation.

## Transport contract

API paths below are direct API paths. Web and nginx use `/api` as a proxy prefix.

| Operation                       | Request                                | Success                                       | Failure                                                                        |
| ------------------------------- | -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| GET /health                     | None                                   | 200: status=ok, configured mode, devices=mock | Database failure produces an HTTP error                                        |
| GET /devices                    | None                                   | 200: array of id/name/on-or-off state         | Adapter failure produces an HTTP error                                         |
| POST /chat                      | JSON: message, optional conversationId | 200: conversationId, message                  | 400 invalid; 404 unknown conversation; 409 busy; 502 agent/application failure |
| GET /conversations/:id/messages | Conversation ID path                   | 200: ordered message array                    | 404 unknown conversation                                                       |
| WS /chat/stream                 | Same JSON as POST /chat                | started, zero or more delta, done             | error event; disallowed origin rejects handshake                               |

Chat input is a strict object. Trim message whitespace; accept 1–4000 characters after trimming. Optional conversationId must be a UUID. Reject unknown fields. HTTP body and WS payload limits are 16,384 bytes. Browser origins must match WEB_ORIGIN when an Origin header is present; rejected HTTP requests return 403.

For WebSocket success, started includes the server conversationId, delta includes text, and done includes conversationId and the full message. Invalid JSON/schema emits INVALID_REQUEST; a second request on a busy socket emits BUSY. Application error codes include NOT_FOUND, BUSY, FORBIDDEN and EMPTY_RESPONSE. Other failures expose generic AGENT_ERROR text. HTTP validation/origin/history failures use an `error` field; chat execution failures use `code` and `message`. Preserve these existing distinctions until a separately planned contract revision.

An accepted request persists its user message before started. A successful response must contain non-whitespace text and be persisted before done. On failure, retain the user message and any execution audit, but do not persist partial assistant text. Partial text may already be visible to the client.

Concurrent turns within one conversation are rejected with BUSY, not queued. Different conversations can progress independently. Socket disconnect does not cancel an accepted turn: the server continues execution and persistence. The protocol has no idempotency key, stream replay or automatic safe retry guarantee.

## Requirements and acceptance scenarios

| ID    | Required behavior                          | Acceptance scenario                                                                                                    |
| ----- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| M1-01 | Credential-free end-to-end chat            | With default env and no network/provider, list devices and complete a light request                                    |
| M1-02 | Narrow mock capability                     | Only light.living_room and light.bedroom may be set to on/off                                                          |
| M1-03 | Validated, authorized execution            | Malformed tool args never invoke gateway; valid ungranted ID records denied                                            |
| M1-04 | Audit before side effects                  | Force pending-record failure and assert no device change; gateway failure yields failed when storage works             |
| M1-05 | Durable ordered history                    | Close/reopen SQLite and compare user/assistant sequence and audit; reject orphan inserts                               |
| M1-06 | Equivalent HTTP/WS use cases               | Exercise completion, validation, missing conversation and public failures on transports                                |
| M1-07 | Concurrency and disconnect semantics       | Overlapping same-conversation request gets BUSY; disconnect does not drop accepted work                                |
| M1-08 | Real adapter fixture coverage              | Installed Strands SDK consumes fixture OpenAI SSE, calls authorized tool and produces final text without cloud traffic |
| M1-09 | Server-only secrets and package boundaries | Build web and run boundary checks; no server provider credentials in web assets/config                                 |
| M1-10 | Minimal usable PWA                         | Chat shows mode, simulated devices, connection/busy/error state; production shell caches without caching operations    |
| M1-11 | Reproducible local deployment              | Immutable install, checks, ARM64 container startup and restart durability succeed                                      |

Mock commands accept `list devices`, `lights`, `status`, and `turn on/off living room/bedroom` with optional light suffix on device commands. The mock agent returns guidance for unsupported text; it is not a natural-language intelligence benchmark.

The browser stores the active conversation and displayed lines only in React memory. Reload does not restore history or reconnect/resume a prior stream. History remains accessible through the API. PWA install behavior across browsers requires separate validation; shell caching does not provide offline control.

## Explicit exclusions

No Home Assistant/MQTT, physical device writes, authentication, remote access, voice capture, wake word, long-term memory, automation or sensitive-action confirmation. No automatic provider fallback that could repeat a device operation. No live-provider acceptance claim based solely on fixture tests.
