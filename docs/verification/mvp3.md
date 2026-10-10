# MVP3 verification — deliberate voice software

Date: 2026-10-10. Base commit: 1769f0d, with the MVP3 working-tree changes. Platform: macOS, Node 24, Yarn 4.13.0 and the existing Colima aarch64 profile. No VM resources/profile changes. See [specification](../specs/mvp3.md), [plan](../plans/mvp3.md) and [setup](../deployment/voice.md).

## Automated software acceptance

- `yarn install --immutable`: passed after the lockfile added the satellite's existing contracts workspace dependency; no external dependency or SDK upgrade.
- `yarn check`: passed package boundaries, production build, strict TypeScript and **136 tests across 13 suites**.
- `yarn format:check` and `git diff --check`: passed.
- Audio contracts cover canonical maximum-duration WAV round-trip, malformed headers/chunks, incorrect sample rate/channels, truncated/trailing/oversized data, fragmented multibyte NDJSON and incomplete/malformed streams.
- Real installed OpenAI SDK fixtures cover multipart WAV recognition, pinned model/language parameters, WAV synthesis, provider rejection, bounded output, abort/deadline and no provider retries. These are fixture calls, not live cloud requests.
- API tests cover recognition → existing authorized tool → persisted text/audit → synthesis, continuation, default mock speech, strict validation before recognition, browser-origin/satellite-token checks, read-only/denied spoken commands, empty/failed recognition recovery, TTS failure after saved execution, two-request capacity, disconnect before recognition and persisted chat after disconnect.
- Browser capture fixtures cover secure-context rejection, permission denial/recovery, late permission cancellation, resource/track cleanup, microphone removal and the 20-second sample limit. They do not run a browser, microphone or speaker.
- Satellite fixtures cover VAD silence/impulses/end-of-speech/duration, capture-before-upload/playback order, scoped authentication, endpoint restrictions, cancellation and no retry after network/speaker failure. Mocked ALSA subprocess tests cover intentional exit 1, missing capture executable, microphone removal, cancellation and speaker EPIPE.

## ARM64 runtime acceptance

`docker info` confirmed the existing Colima aarch64 daemon. Docker build initially required sandbox approval for its buildx activity file; after approval, the ARM64 API/web images built and an isolated Compose project became healthy. The test project used only mock agent/speech/devices, its own SQLite volume and loopback API/web ports 13001/18080. The existing Aura HA/OpenAI stack and HA data/configuration were preserved.

The repeatable `yarn verify:voice` script passed through the API, checking ordered streamed speech/chat events, WAV output, persisted two-message history and an empty write audit for status. With the isolated fixture SATELLITE_TOKEN it also passed the satellite capture/upload/playback callback path. The CLI `yarn voice:once --fixture --no-playback` passed separately. The HTTP voice check also passed through nginx, confirming the proxy accepts the audio request and delivers NDJSON. Existing mock Compose checks passed, including API restart and durable chat/audit inspection.

The isolated stack was removed after checks, including only its disposable fixture volume. No physical HA service calls or paid provider requests were made. Docker verification is local ARM64 runtime evidence, not Raspberry Pi measurements.

## Open platform acceptance

Browser runtime selection reported no available browser; read-only discovery confirmed an empty browser list. Actual UI visual interaction, secure-context microphone access, autoplay blocking/replay, audible playback, offline shell/installability and cross-browser behavior remain unverified. Capture fixtures are explicitly separate from those checks.

No Raspberry Pi or USB microphone/speaker was available. Real ALSA capture/playback, ambient-noise VAD tuning, physical device removal/reconnection, latency/CPU/RSS/container-memory/SSD measurements and agreed release budgets remain open. No new live OpenAI STT/TTS acceptance was run. MVP2's earlier live text-agent check does not certify speech integration. Follow the voice deployment guide for deliberate live/hardware acceptance; do not claim a hardware release from these fixtures or start MVP4 implicitly.
