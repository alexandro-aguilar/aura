# MVP2 read-only slice specification

Historical snapshot: superseded by the [full MVP2 specification](mvp2.md) and [current verification](../verification/mvp2.md). Statements below describe the earlier read-only slice, not the current feature limit.

Original status: implemented first slice of M2-T02. M2-T01 API choices are recorded below; physical deployment/authentication decisions remain open. M2-T03–05 are not implemented. Requirements: initial read-only portion of P-06, S-01–03 and S-07–08.

## Decisions and official basis

Reviewed 2026-10-10: [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest/) documents bearer authentication, per-entity GET `/api/states/<entity_id>`, state fields and 404 for missing entities. Use those individual read endpoints so unlisted household entities are never fetched. Native Node fetch supplies timeout/redirect controls without a new SDK or dependency. Existing direct version pins are unchanged.

[Strands tool documentation](https://strandsagents.com/docs/user-guide/sdk/tools/) was rechecked before configuring the tool list. Keep the installed, fixture-tested SDK 1.20.0 and existing tool API; read-only mode registers list_devices only. No SDK upgrade is part of this slice.

Use request-time REST snapshots, not subscriptions or a stale-state cache. Do not infer physical reporting freshness from a successful read or from an unchanged state. Backend failure returns an error rather than the previous value. WebSocket state subscriptions and physical state reconciliation remain later decisions.

## Contract

`DEVICE_BACKEND=mock` is the default and preserves MVP1 behavior. `home-assistant` requires `HA_URL`, `HA_TOKEN`, `HA_LIGHT_IDS` and optional `HA_TIMEOUT_MS` (default 5000; range 1–30000). Config rejects invalid origins, credentials embedded in URLs, duplicate/non-light IDs, empty allowlists, more than 32 IDs and invalid timeouts. Config remains server-owned.

`GET /devices` returns an array with id, name, state and optional observedAt. Existing mock payloads retain their shape. Device state now accepts on/off/unavailable/unknown; Home Assistant responses include observedAt as an ISO UTC observation timestamp. Runtime schemas validate upstream states and browser device payloads. Unexpected fields are not forwarded. Mismatched entity IDs or unsupported states fail validation. A missing configured entity maps to unavailable.

Gateway failures produce HTTP 503 with code DEVICE_UNAVAILABLE, DEVICE_AUTH_FAILED or DEVICE_RESPONSE_INVALID and sanitized text. The health payload retains status/mode/devices; devices can now be home-assistant. Health does not contact Home Assistant. Backend and agent modes are independent.

The PWA lists lights and states with Refresh and observation timestamps. Failed refresh clears old results. Superseded refresh requests are aborted so older responses cannot replace new snapshots. Read-only mode is visible in status/welcome text. Deterministic chat supports list/status but performs no writes. OpenAI mode exposes no set_light tool. Application grants are empty and gateway setLight rejects before any network call as additional enforcement.

## Acceptance

| ID     | Scenario                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| M2-R01 | Default configuration and OpenAI selection alone retain mock devices                                                            |
| M2-R02 | Invalid HA credentials/configuration shapes fail fast without logging values                                                    |
| M2-R03 | Only explicit light IDs are requested using GET with bearer authentication, timeout and redirects disabled                      |
| M2-R04 | All four states and missing entities map correctly; malformed/mismatched responses fail                                         |
| M2-R05 | Auth failures, network failures and timeouts return sanitized errors without automatic retries; a new explicit read can recover |
| M2-R06 | HTTP and deterministic chat read actual adapter snapshots; health remains local                                                 |
| M2-R07 | Gateway writes never call fetch; deterministic chat refuses writes; real SDK fixture exposes only list_devices                  |
| M2-R08 | Mock Compose startup, chat/stream and restart durability still pass                                                             |

The [verification record](../verification/mvp2-read-only.md) reports 59 passing tests, strict checks and rebuilt ARM64 mock container acceptance. Fixture tests cover the adapter, configuration, API composition, native HTTP and actual Strands loop. No live Home Assistant token/instance or physical lights were used. Real backend, target Pi, visual browser interaction and offline PWA behavior remain unverified. Physical writes, direct controls, identity/TLS and full Home Assistant deployment are still future MVP2 tasks.
