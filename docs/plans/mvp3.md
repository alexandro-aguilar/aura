# MVP3 plan — deliberate voice

Status: proposed. Entry requires MVP2 exit. Requirement P-08 plus existing safety rules. Use push-to-talk first; wake word belongs to MVP4.

| Task                                         | Owner packages                  | Depends on | Deliverable and acceptance                                                                                                                                                           |
| -------------------------------------------- | ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M3-T01 Audio contract and provider decisions | contracts, domain, docs         | MVP2 exit  | Inspect official STT/TTS APIs; choose language/voice, supported formats, duration/size limits, cancellation policy and retention; resolve browser HTTPS and satellite authentication |
| M3-T02 Server speech slice                   | application, integrations, api  | T01        | STT/TTS ports and adapters with deterministic fixtures; bounded upload/stream validation; explicit session states; credentials stay server-only                                      |
| M3-T03 Browser push-to-talk                  | web, contracts, api             | T02        | User starts/stops capture, sees recording/transcribing/responding/playback/error states, can recover from permission denial; transcript feeds the existing chat/policy path          |
| M3-T04 Satellite slice                       | voice-satellite, contracts, api | T02        | USB capture → VAD/end-of-turn → STT → agent → TTS playback with explicit activation, bounded buffering and audio fixtures; suppress self-capture during playback                     |
| M3-T05 Hardware and recovery acceptance      | All affected, docs              | T03–04     | Measure Pi resource use and end-to-end latency; test microphone removal, network/provider loss, invalid audio, playback failure and restart; agree release budgets                   |

Voice client packages remain transport/playback clients importing only shared contracts. Put provider SDKs in server integrations and authorization in application. Audio device libraries are implementation choices to investigate, not pre-approved dependencies. Resolve hardware/provider decisions before coupling the satellite to a particular API.

Define what stopping playback versus cancelling a turn means before implementation. Once an operation has executed, cancellation cannot undo it; show uncertain completion and provide state/history inspection. Do not automatically resubmit audio after disconnect. Spoken requests have the same grants as typed requests; voice identity alone does not create new permissions.

Verification uses deterministic audio/provider fixtures for the speech adapters and full STT-to-existing-tool-to-TTS flow, browser capture/permission/manual checks, malformed/oversized inputs, and disconnect/cancellation behavior. Run target microphone/speaker tests on the actual Pi and record latency and memory. Browser microphone testing must use localhost or an approved secure context.

Exit: PWA and satellite complete deliberate voice turns, text/direct control remain available, capture state is clear, provider keys never reach clients, and raw audio is not durably retained by default. Document any provider-side retention separately. Wake word, background recording and long-term voice memory are excluded.
