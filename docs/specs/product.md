# Aura product specification

## Purpose and users

Aura is a single-household assistant for inspecting and controlling a home through a React PWA and, later, a physical voice satellite. The target host is a Raspberry Pi 5 with 8 GB RAM and SSD. Developers must be able to run a deterministic simulation on a laptop without Home Assistant, audio hardware or cloud credentials.

The initial user is a trusted local operator. Household identity, roles, remote access and multi-user authorization are not implemented in MVP1. A LAN or remote deployment must resolve those controls before expanding access.

## User outcomes and requirements

| ID   | Requirement                                                      | Phase | Acceptance                                                                           |
| ---- | ---------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------ |
| P-01 | Send text, receive incremental text, continue a conversation     | MVP1  | HTTP and WebSocket complete the same application use case; history is durable        |
| P-02 | Inspect and change only authorized simulated lights              | MVP1  | Living room and bedroom work without credentials; ungranted IDs cannot execute       |
| P-03 | Inspect execution outcomes after failure or restart              | MVP1  | Durable audit distinguishes pending, succeeded, denied and failed                    |
| P-04 | Operate independently of cloud services in mock mode             | MVP1  | Fresh local setup and tests require no provider or hardware                          |
| P-05 | Install/cache the PWA shell without replaying operations offline | MVP1  | Shell loads after a successful online visit; API requests are never cached or queued |
| P-06 | Read and control explicitly granted Home Assistant lights        | MVP2  | Narrow tools, validated targets, audit, state reconciliation and outage tests pass   |
| P-07 | Use deterministic local controls when the LLM is unavailable     | MVP2  | A non-agent control route works with Home Assistant available and provider disabled  |
| P-08 | Speak using deliberate push-to-talk from browser and satellite   | MVP3  | STT → existing agent/tool path → TTS works; text remains usable                      |
| P-09 | Activate by wake word with a visible/listenable capture state    | MVP4  | Wake detection, mute and accidental activation checks pass on target hardware        |
| P-10 | Save, inspect and remove explicitly approved preferences/memory  | MVP4  | Restart persistence, consent and deletion checks pass                                |
| P-11 | Run bounded, explicit event automations                          | MVP4  | Disabled by default; dry-run, authorization, audit and loop prevention checks pass   |

## Safety and reliability requirements

- S-01: Validate untrusted transport and tool input at runtime. Deny operations by default; authorize every execution in application code using server-owned grants.
- S-02: Never expose generic Home Assistant service dispatch, arbitrary scripts, shell access or caller-supplied authorization to the agent.
- S-03: Keep credentials and provider configuration server-only. The browser and satellite must not receive cloud or Home Assistant secrets.
- S-04: Persist a pending audit before invoking a device gateway. Audit persistence failure blocks execution. Interrupted pending operations require inspection rather than automatic replay.
- S-05: Treat device state changes and conversation completion as separate outcomes. A failed answer or disconnected client does not prove that a device operation failed.
- S-06: Introduce sensitive device capabilities only after an explicit scope decision and an expiring, operation-bound confirmation design. Locks, alarms and other sensitive actions are excluded from the current light scope.
- S-07: All phases preserve deterministic mock mode and test adapters. Home Assistant/cloud outages must produce actionable failure states.
- S-08: Operational logs must not intentionally contain credentials or conversation/audio content. Review provider error logging for accidental disclosure before broader deployment.

## Scope and phase gates

MVP1 delivers chat with simulated tools, SQLite and local containers. MVP2 adds Home Assistant and direct local controls. MVP3 adds deliberate voice interaction. MVP4 considers wake word, user-approved memory and explicit automation as separate slices. MQTT is optional and requires a concrete need before introduction.

Do not build all phases at once. Each phase must have passing behavior tests, reproducible local instructions and an updated evidence record before the next begins. Actual Raspberry Pi acceptance is separate from ARM64 container validation on macOS.

## Product decisions still needed

| Decision                                       | Needed before             | Default planning assumption                          |
| ---------------------------------------------- | ------------------------- | ---------------------------------------------------- |
| Household devices and allowed entities         | MVP2 physical writes      | Explicitly named low-risk lights only                |
| LAN exposure, authentication and TLS           | Access beyond loopback    | Keep existing loopback deployment until resolved     |
| Audio providers, language, voice and retention | MVP3 provider integration | Explicit capture; no durable raw audio by default    |
| Satellite microphone/speaker and installation  | MVP3 hardware validation  | USB microphone/speaker on the target host            |
| Voice latency and resource budgets             | MVP3 acceptance           | Measure first on Pi; agree thresholds before release |
| Memory categories and retention                | MVP4 memory               | User-approved preferences only                       |
| Automation events, limits and schedules        | MVP4 automation           | Explicit allowlist and disabled-by-default rules     |

No latency, availability or cost target is claimed by the existing scaffold. Measure chat latency, provider/tool failures, memory use and container startup on target hardware before setting release budgets. Historical verification is recorded in README and SDK evidence; it is not a fresh run of those checks.
