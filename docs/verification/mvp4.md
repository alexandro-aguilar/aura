# MVP4 verification — 2026-10-10

Software implemented at the user's explicit request; Porcupine dependency approved separately. Node 24.18.0, Yarn 4.13.0, macOS ARM64 and existing Colima default profile. Changes remain in the workspace with the earlier MVP3 work. No live provider request, real HA write, credential activation or physical hardware test was performed for MVP4.

## Software evidence

- `yarn install --immutable`: passed with Porcupine Node 4.0.2 pinned.
- `yarn check`: workspace boundaries, production builds, strict source/test type checks and **164 tests across 16 suites** passed.
- `yarn format:check`, `git diff --check` and Compose configuration validation: passed.
- Approved-memory API integration covers strict consent/categories, injection rejection, provenance source validation, replacement, disabled context, subsequent-turn deletion and restart durability. An actual installed-Strands fixture confirms fixed language instructions, rejection of arbitrary memory text and no new permission/memory/automation tools.
- Deterministic automation fixtures cover disabled defaults, explicit consent, dry-run without effects, cycle rejection, parallel deduplication, stale/future events, cooldown, four-attempt global rate, current authorization, pending-first reservation, storage failures before/after dispatch, uncertainty without retry, emergency disable during a batch, restart deduplication (including pending reservations), persisted emergency stop and snapshot outage/recovery baseline.
- API integration covers create/inspect/dry-run/activation/disable/delete, foreign-origin rejection and a polled mock transition through the actual control/audit path.
- Wake fixtures cover opt-in/key validation, fragmented PCM framing, muted startup, no turn before detection, repeated-unmute exclusion, abort during listening/activation, microphone closure before feedback/turn, no rearming during playback, and failure returning to muted without retry. They use an injected engine/session I/O, not a real licensed Porcupine engine.
- SQLite migrations from v1 preserve ordered histories/audits, integrity and foreign keys; v3 → v4 preserves approved preference provenance. Fresh automation execution is disabled.

## ARM64 container evidence

Built API/web `linux/arm64` images with immutable dependencies and started healthy services under isolated Compose project `aura-mvp3-verify`, API port 13001 and nginx port 18080. Forced mock agent/devices/speech, enabled only memory/automation test switches, used a disposable volume and fixture satellite token. The existing `aura` stack, HA installation and their volumes were preserved; Colima was left running.

`verify:mvp4 --restart` passed against the isolated stack: saved preference enters mock context; rule starts disabled; dry-run makes no receipt; separately approved rule/global activation sees a polled transition; target state and succeeded audit agree; preference, activation and receipt survive API restart; emergency stop survives restart; deleting preference/rule survives another restart and future context omits the deleted preference. The script requires mock health, both test switches, no active rules and no existing preferences before it changes anything. It retains historical receipts/audits.

`verify:compose --restart` passed for nginx/static PWA assets, proxied HTTP/WebSocket chat, direct authorized/denied controls, audit/history restart durability, non-root ARM64 execution, SQLite integrity and foreign keys. `verify:voice` and the satellite fixture CLI also passed against mock speech/agent mode. Final automation origin guard was checked through the container's HTTP endpoint.

The first MVP4 smoke was interrupted by an accidentally overlapping Compose restart check. Disposable fixtures were reset and checks rerun sequentially; only the sequential successful runs count as evidence. This was a test orchestration error, not an application retry.

## Open acceptance

MVP4 software is complete; target deployment acceptance is not. Real Picovoice AccessKey entitlement/native engine initialization, Pi/USB audio, custom wake/language models, false/missed activations, room-noise/echo, CPU/RSS and activation latency require target hardware. No numeric detection guarantee is claimed. Agree thresholds after measurements, then enable one capability at a time.

No interactive browser was available in this session. Visual settings controls, actual browser recording/autoplay/mobile behavior, live STT/TTS and physical devices remain open along with the earlier MVP3 gates. Static assets and transport fixtures do not establish browser or hardware acceptance. See [setup and recovery](../deployment/mvp4.md) and [behavior/retention contracts](../specs/mvp4.md).

## Runtime memory configuration — 2026-10-11

Memory now uses SQLite migration 5 and `POST /preferences/control`, replacing the environment switch. Fresh and upgraded databases start with memory disabled; existing preference provenance, conversations, audit and automation control are preserved. Enabling requires `{"enabled":true,"consent":true}` and disabling accepts `{"enabled":false}`. The setting survives restart and affects subsequent HTTP, WebSocket and voice turns; a turn already in chat processing keeps its preference snapshot. `GET /preferences` reports persisted state. Settings provides explicit activation approval, enable/disable and refresh controls, and preserves a separate approval for saving each preference. The retired environment variable is ignored and removed from Compose, the environment example and local `.env`.

- Workspace builds, strict source/test typecheck, boundary checks and **173 tests across 17 suites** pass. New coverage includes rejected/foreign-origin control requests, legacy environment values not enabling memory, live HTTP/WebSocket/voice changes, in-flight snapshots, persisted enabled/disabled states and migrations from v3/v4 without altering preference provenance or automation control.
- ARM64 API/web images build with immutable dependencies. The isolated `aura-memory-verify` mock stack at ports 5301/5808 passed `verify:mvp4 --restart`, including memory activation/disable persistence and existing automation behavior. The normal development API recognizes the new endpoint (an invalid empty request returns 400 without altering state). No provider requests, credentials, real HA writes or physical hardware were used.
- The temporary browser harness `/private/tmp/aura-chat-browser/check-memory-control.mjs` passes headless Chromium/WebKit in light/dark preferences. It checks truthful initial loading, separate consent, disabled busy controls, a forced failed activation followed by refresh/recovery, saving/deleting a preference, disable without deleting values, immediate changes in an existing chat, reload persistence, and 320/390/768/1440 pixel reflow. Mobile/desktop captures under `/private/tmp/aura-memory-review` were inspected. The UI check also exposed and fixed an existing preference-delete bug: bodyless DELETE requests must omit the JSON content-type header or Fastify rejects them. Native browser/audio/device acceptance gaps remain open.
- Touched-file formatting and `git diff --check` pass. The repository-wide formatting check flags three unchanged pre-existing evidence files: `assets/glass-visibility/measurements.json`, `assets/reference-dashboard/measurements.json` and `assets/reference-dashboard/performance.json` under `docs/verification`. Their recorded data was left untouched.
