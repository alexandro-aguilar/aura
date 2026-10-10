# Deliberate voice setup and recovery

MVP3 adds browser push-to-talk and a one-turn Linux satellite. See [the contract](../specs/mvp3.md) and [verification evidence](../verification/mvp3.md). No wake word, continuous/background capture, MQTT or voice memory is enabled.

## Local mock development

Use the README's normal `yarn install --immutable`, `yarn check`, `yarn dev:api` and `yarn dev:web`. Open **http://localhost:5173**. In Talk to Aura, choose Start recording, allow microphone access, speak, and choose Stop and send. Discard recording sends nothing. Recording automatically stops/sends at 20 seconds. The microphone closes before the request; playback cannot be captured into the same turn.

Default `SPEECH_MODE=mock` ignores the spoken words, returns transcript `status` and plays a brief tone. This tests capture/transport/playback without OpenAI, Home Assistant or a Pi; it does not recognize speech offline. Keep AGENT_MODE=mock too for credential-free checks. Speech and agent selection are independent.

Microphone capture requires localhost or HTTPS. When browsing a Pi through SSH, forward its web/API ports and open the matching localhost origin; set WEB_ORIGIN accordingly. Plain HTTP LAN addresses are unsuitable for browser microphone access. Direct light controls and typed chat remain available when voice fails. Browser permission denial can be corrected in site settings, followed by a new Start recording attempt. If autoplay is blocked, choose Play reply. Stop playback stops only the speaker, not an accepted device operation.

## Optional OpenAI speech

Configure only the API's private `.env` (or `.env.home-assistant.local` for the existing HA Compose overlay):

```dotenv
SPEECH_MODE=openai
SPEECH_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe-2025-12-15
SPEECH_TTS_MODEL=gpt-4o-mini-tts-2025-12-15
SPEECH_LANGUAGE=en
SPEECH_VOICE=coral
SPEECH_TIMEOUT_MS=30000
```

The API also needs OPENAI_API_KEY; AGENT_MODE=openai is optional and configured independently. Restart source development or recreate the applicable Compose stack to apply changes. Do not change HA write grants merely to enable speech. `SPEECH_LANGUAGE=es` selects Spanish recognition; the agent's language behavior still follows its prompt/context. Language is a two-letter code and the configured built-in voice must be supported. The API has a fixed trusted OpenAI endpoint and does not accept client-selected models, voices, URLs or credentials.

Real speech incurs paid provider requests. An intentionally submitted turn makes one recognition call and, after successful chat, one synthesis call; an OpenAI agent may additionally make multiple model/tool-loop calls. There are no automatic speech retries or fallback execution. Raw audio is not durably retained by Aura. Transcribed text and answers persist like typed chat. Provider retention is separate: the [official data controls table](https://developers.openai.com/api/docs/guides/your-data) currently lists no abuse-monitoring or application-state retention for `/v1/audio/transcriptions`, and 30-day abuse-monitoring retention with no application-state retention for `/v1/audio/speech`, subject to account controls and policy exceptions. Check your account's applicable terms; local non-retention is not a provider guarantee.

## Linux satellite

Install the existing Node 24/Yarn toolchain and the OS `alsa-utils` package on the satellite host. USB capture/speaker acceptance needs actual Linux hardware. Native ALSA is used on the host, so the API/web containers need no sound-device mounts, privileged mode or audio libraries. macOS development uses the fixture/file transport path below.

Build with `yarn build`. List hardware with `arecord -l` and `aplay -l`; select stable ALSA names such as `plughw:CARD=Device,DEV=0` if the defaults are unsuitable. The plug device can convert a hardware format to the required mono 16 kHz PCM16 stream.

Generate a random token locally, for example `openssl rand -hex 32`, and store the same value as SATELLITE_TOKEN in the API's private environment and a separate **`.env.voice-satellite`** on the satellite:

```dotenv
AURA_API_URL=http://127.0.0.1:3001
SATELLITE_TOKEN=replace-with-your-random-token
ALSA_CAPTURE_DEVICE=default
ALSA_PLAYBACK_DEVICE=default
```

The placeholder is intentionally invalid. Protect both private files with mode 600. `.env.voice-satellite` is ignored by Git, formatting and Docker build context. Copy only the scoped satellite token/audio settings to the satellite, never the server environment file or provider/HA secrets. Rotate the API token and restart the API plus satellite when access changes; empty API token disables headless uploads. The current single trusted operator deployment has one token, not per-household identity or revocation records.

Run one deliberate turn:

```sh
yarn voice:once
```

Speak after Listening appears. End-of-speech is 0.9 seconds of silence after voiced audio. Eight seconds without speech fails without submission; total capture is bounded to 20 seconds. It closes arecord before uploading, prints phases/transcript/text and conversation ID, plays the reply, then exits. Run the command again only for another deliberate turn. Ctrl-C during capture discards it; after upload it stops waiting/playback while the server may finish the accepted action. Optional VOICE_CONVERSATION_ID continues an existing conversation. The client never recaptures or resends automatically.

A remote satellite must access the existing loopback deployment through an authenticated SSH tunnel, for example `ssh -N -L 3001:127.0.0.1:3001 user@api-host`, using AURA_API_URL=http://127.0.0.1:3001. HTTPS origins are also accepted by the client, but configuring LAN/public service exposure and household authentication is separate work. Browser origins do not establish user identity. Do not expose this trusted local API to an untrusted network.

## Repeatable mock smoke checks

Against a running mock agent + mock speech stack, with AURA_API_URL and VOICE_WEB_ORIGIN matching its API/browser addresses:

```sh
yarn verify:voice
# Optional authenticated satellite fixture using SATELLITE_TOKEN from your shell:
yarn voice:once --fixture --no-playback
# Canonical local WAV input instead of ALSA capture:
yarn voice:once --file /path/to/canonical.wav --no-playback
```

`verify:voice` refuses paid agent/speech modes, submits `status`, validates streamed phases/audio, persisted messages and no write audit, and exercises satellite transport when SATELLITE_TOKEN is provided in its environment. It does not load a private env file itself. The CLI reads only `.env.voice-satellite`; `--fixture` also refuses non-mock agent/speech configurations. `--file` accepts canonical mono PCM16 16 kHz WAV only, up to 20 seconds. `--no-playback` skips the speaker explicitly. No fixture is written to disk.

## Failure and remaining acceptance

The client receives a conversation ID before recognition. Inspect its History/Audit links or GET /conversations/:id/messages and /audit, then GET /devices after disconnect, timeout or an uncertain action. Empty messages after recognition failure means chat was not reached. An audio failure after a text response does not imply a failed light operation. Never resubmit merely because playback was absent. Restart preserves text/audit but never replays a recording.

Missing/removed microphones, ALSA startup failure and no-speech captures fail before upload. Missing/removed speakers fail after the saved text response and never trigger another device operation. Recognition failure produces no user/assistant messages; synthesis failure leaves the completed text turn intact. Provider errors are sanitized and logged with codes/conversation IDs, without recording/transcript content. Raw audio stays in transient buffers; clients clear capture resources/object URLs and requests use no-store. The service worker excludes every /api request and never queues operations.

Before hardware release, record browser/OS and actual permission denial/recovery, recording, discard, 20-second stop, autoplay blocking, playback stop, offline/reconnect and microphone removal. On the Pi, record USB device/ALSA names, VAD behavior in ambient noise, capture/playback removal, network/provider failure, API/satellite restart and persisted audit. Measure capture-end→transcript, transcript→saved response, response→playback and total latency, CPU/RSS, container memory and SSD persistence. Agree latency/resource thresholds from those measurements; no hardware budget or live speech acceptance is claimed by fixture tests. Live-provider checks must use deliberate low-risk requests and inspected device grants.
