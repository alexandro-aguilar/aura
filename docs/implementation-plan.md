# Project delivery plan

Read [AGENTS.md](../AGENTS.md), [README](../README.md) and the [specifications index](specs/README.md) before implementation. Deliver one thin vertical slice at a time. MVP1 backend/container closure is recorded in [the verification evidence](verification/mvp1-closure.md). MVP2 software and the local macOS Home Assistant deployment are implemented and [verified](verification/mvp2.md). Raspberry Pi acceptance is deferred by the user until hardware is supplied; visual browser and physical-device checks remain open. MVP3 voice software is implemented with [local evidence](verification/mvp3.md); browser/live speech and Pi/USB acceptance remain open. Preserve the mock baseline and do not begin later phases without selecting that work.

## Ordered phases

| Phase | Outcome                                                              | Plan                                    | Dependency/status                                                 |
| ----- | -------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| MVP1  | Streaming chat, mock lights, SQLite, PWA shell and ARM64 Compose     | [Closure and validation](plans/mvp1.md) | Backend/container closure passed; browser checks remain open      |
| MVP2  | Narrow Home Assistant lights and provider-independent local controls | [Home Assistant](plans/mvp2.md)         | Implemented and locally verified; Pi acceptance deferred          |
| MVP3  | Browser push-to-talk and physical satellite STT/agent/TTS            | [Voice](plans/mvp3.md)                  | Software implemented; browser/live speech/Pi acceptance open      |
| MVP4  | Wake word, explicit memory and bounded event automation              | [Advanced capabilities](plans/mvp4.md)  | Software implemented at user request; independent acceptance open |

See [architecture](specs/architecture.md) for package ownership and dependency rules. Specs define acceptance; phase plans define task order and evidence. Later-phase plans are design proposals, not statements that features already exist.

The [CSS design system plan](plans/frontend-liquid-glass.md) defines a separate, incremental Liquid Glass-inspired styling pass for the existing frontend, including tokens, accessibility fallbacks, panel styling and visual verification.

## Working process

1. Select the next unfinished slice in the current phase and its requirement IDs.
2. Recheck official SDK/API documentation before SDK changes and record exact compatible pins. Use the existing stack; ask before major dependencies or architecture changes.
3. Resolve blocking product/security choices for that slice. Continue independent mock work while hardware or deployment decisions remain open.
4. Implement contracts/domain ports, application behavior, adapters and transport/UI as the slice requires. Keep authorization and auditing in the application path.
5. Add meaningful unit and integration tests for success, invalid input, policy denial, dependency failure and restart/disconnect where relevant.
6. Run affected checks, then the phase exit checks. Update setup docs, compatibility evidence and limitations with actual results.
7. Review the exit gate before selecting work from the next phase. Do not advance on historical evidence alone when relevant code or dependencies have changed.

Each implementation task should record requirement IDs, affected packages, dependencies, acceptance scenarios, validation commands/results and unresolved limitations. Task IDs in the phase plans can be used directly in issues or PRs; creating external issues is outside this documentation change.

## Verification and release evidence

The local baseline is `yarn install --immutable`, `yarn check`, `yarn format:check` and `docker compose config --quiet`. Container changes require actual build/start and smoke checks from README, not configuration validation alone. Check `docker info`; if needed start the existing Colima default profile according to AGENTS.md. Retain its configuration and leave it running.

Record date, platform, commit when available, configuration mode, commands, results and known gaps. Never label fixtures as live provider validation or emulated/container ARM64 execution as physical Pi validation. Keep a simulated route available throughout development.

MVP4 software was explicitly selected by the user while the recorded MVP3 hardware/browser gates remain open. See [MVP4 evidence](verification/mvp4.md); no prior acceptance gap is closed by these fixtures.
