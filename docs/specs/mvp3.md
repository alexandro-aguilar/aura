# MVP3 specification — deliberate voice

Status: software implemented for P-08 and S-01–08. Deterministic local validation is recorded in [verification](../verification/mvp3.md). Browser visual/microphone checks, live speech-provider acceptance and Pi/USB-device measurements remain open. No MVP4 capability is included.

## Decisions and boundaries

Use the existing OpenAI SDK 6.45.0, without an SDK upgrade or new external application dependency. Default speech is a deterministic mock: any valid recording transcribes to `status` and synthesis returns an acknowledgement tone. This is a transport fixture, not offline speech recognition. `SPEECH_MODE` is independent of agent and device modes. Real recognition/synthesis use server-only OpenAI credentials with pinned model snapshots, English and coral by default; language and voice are configurable. See the [official API evidence](../sdk-compatibility.md).

Browser capture uses Web Audio/AudioWorklet in a secure context, including localhost. The client explicitly starts recording and chooses Stop and send or Discard; 20 seconds triggers automatic stop/send. Permission denial is recoverable through another deliberate attempt after browser permissions are corrected. Tracks/context/worklet are released before upload and on discard, removal or unmount. A browser that cannot provide a 16 kHz AudioContext fails visibly rather than mislabelling its audio.

The satellite is a one-turn Node process on Linux using installed `alsa-utils`, with optional separate capture/playback devices. No Node audio library is added. `yarn voice:once` explicitly activates capture. An energy VAD processes 20 ms PCM frames: at least 160 ms of voiced frames, 900 ms trailing silence, eight seconds without speech, and a hard 20-second sample limit. Energy VAD is not a speech classifier and requires physical environment testing. Capture has a 22-second wall-clock watchdog. ALSA's expected exit 1 after deliberate termination is accepted only at VAD completion; missing executables, unexpected exit, transport error, cancellation and forced kill fail without upload. Playback begins after the capture process closes. There is no continuous capture, wake word or automatic recapture/retry.

Voice client workspaces import only contracts. Domain owns speech ports; integrations own provider calls; application composes recognition, existing ChatService and synthesis. ChatService still enforces conversation concurrency and uses the existing agent, device grants and durable audit. Voice cannot select providers, grant entities or dispatch generic HA services.

## Transport

`GET /voice/capabilities` returns public speech mode, format and maximum duration without contacting a provider. `/health` retains its MVP2 local-only contract.

`POST /voice/turn` accepts strict JSON `{audioBase64, conversationId?}`. Input is canonical RIFF/WAVE PCM16, mono, 16000 Hz, 0.1–20 seconds, at most 640044 decoded bytes. All sizes, header fields and chunk lengths must agree; compressed WAV, trailing bytes, malformed base64, arbitrary extra fields and unknown conversation IDs fail before recognition. The HTTP body cap applies only to this route; chat/WS retain their existing small limits. At most two voice requests run in one API process; excess requests return 429 without recognition or chat.

Browser uploads require the configured exact `WEB_ORIGIN`. Headless uploads without Origin require a random 32–128 character URL-safe `SATELLITE_TOKEN` bearer credential, compared with timingSafeEqual; no configured token means headless voice is disabled. Foreign browser origins remain forbidden even with a token. Origin is not identity: this retains the trusted local operator and loopback model, not general household authentication. Remote satellites use encrypted authenticated SSH tunnels to the loopback API; the client rejects cleartext non-loopback origins and redirects. Do not expose the API publicly or to the LAN on the strength of these checks.

Valid requests stream `application/x-ndjson`, `Cache-Control: no-store`, and disable nginx buffering. Events:

1. `accepted` with the existing or newly created conversation ID, available before recognition for recovery.
2. `phase: transcribing`, then `transcript` with trimmed, validated text (1–4000 characters).
3. `phase: responding` and text `delta` events from ChatService.
4. `response` with the complete saved assistant text.
5. `phase: synthesizing`, then `audio` with base64 WAV (at most 4 MiB), then `done`.

An `error` is terminal and sanitized. Before acceptance, invalid requests return 400, unknown conversations 404, missing satellite authentication 401, foreign origins 403 and capacity exhaustion 429; HTTP body-limit rejection is 413. After acceptance, failures are streamed errors with the conversation ID already known. The shared client parser bounds the full response to 8 MiB, validates event shapes and rejects incomplete streams. Clients upload once and never automatically resubmit.

## Completion and recovery

Discarding capture submits nothing. A disconnect during recognition aborts it and prevents chat. After recognized text enters ChatService, the server drains the accepted chat and persists the outcome even if the response stream disconnects. It skips synthesis for a disconnected client. Closing a client or stopping playback never undoes device execution. `/conversations/:id/messages`, `/conversations/:id/audit` and `/devices` remain the recovery path. A new empty conversation after recognition failure is intentional and contains no raw recording.

Recognition/synthesis have bounded provider requests (default 30 seconds each) and zero SDK retries. Client network timeout is 180 seconds. TTS consumes at most the first 4000 characters of a response; the complete text remains in history. Synthesis or speaker failure cannot replay the agent/tools: completed text/audit remain saved. Browser autoplay rejection exposes a Play reply button; stopping playback only stops audio. Chat text and direct controls remain usable independently of voice; the browser serializes its typed/voice turns while retaining independent direct controls.

Raw input/output audio stays in bounded process/browser memory and is not written to SQLite, files, operational logs or the service-worker cache. Captured tracks, object URLs and process buffers are released when done. Transcripts and assistant text use the existing durable message retention. Provider-side handling is separate; see [deployment and retention](../deployment/voice.md). The browser discloses AI-generated playback and explicitly labels mock recognition/tone behavior.

## Acceptance matrix

| ID    | Evidence                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3-01 | Strict bounded audio/transport validation before recognition; secrets and grants stay server-side                                                              |
| M3-02 | SDK multipart STT and WAV TTS fixture calls; status errors, deadlines, cancellation, no retry and output limits                                                |
| M3-03 | Recognition → existing authorized light tool → durable history/audit → audio; denied/read-only operations remain enforced                                      |
| M3-04 | Browser secure context, explicit capture/discard, permission recovery, limit, microphone removal and resource cleanup fixtures                                 |
| M3-05 | Satellite one-turn VAD, no-speech/limit fixtures, authenticated transport, capture-before-playback and ALSA failure/cancellation fixtures                      |
| M3-06 | Disconnect before recognition prevents execution; disconnect after chat acceptance drains/persists; TTS failure preserves text/audit                           |
| M3-07 | ARM64 API/web and nginx streaming plus mock satellite end-to-end smoke checks                                                                                  |
| M3-08 | Pending: actual browser recording/autoplay, live OpenAI speech, USB/Pi microphone removal/recovery, latency/memory/SSD measurements and agreed release budgets |

Hardware and browser fixtures do not certify real devices. Follow the [voice guide](../deployment/voice.md) for remaining acceptance and record the environment/results before claiming a hardware release.
