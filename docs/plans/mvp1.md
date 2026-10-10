# MVP1 closure plan

Scope: validate the implemented [MVP1 specification](../specs/mvp1.md) without adding future-phase features. Closure checks were run after specification authoring: see [dated evidence](../verification/mvp1-closure.md). Backend/container gates pass; visual/offline browser checks remain unverified.

| Task                                | Owner packages                      | Dependencies | Work and acceptance                                                                                                                    |
| ----------------------------------- | ----------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| M1-T01 Baseline review              | All                                 | None         | Compare M1-01–11 against source/tests; identify missing scenarios and distinguish existing code from unverified runtime behavior       |
| M1-T02 Reproducible toolchain       | Root, agent, integrations           | T01          | Check pinned Node/Yarn/dependencies and immutable install; consult official docs before SDK changes; retain fixture tool-loop test     |
| M1-T03 Application/persistence gaps | application, persistence, contracts | T01          | Fill only demonstrated behavior-test gaps for validation, denial, audit-before-execution, storage failures, durability and busy guards |
| M1-T04 Transport/PWA gaps           | api, web                            | T03          | Verify HTTP/WS error behavior, disconnect continuation, streaming UI, shell caching and absence of offline operation replay            |
| M1-T05 Container acceptance         | api, web, root                      | T02–04       | Build/run ARM64 Compose; check health, proxied chat/WS, validation/origin handling, non-root API and restart durability                |
| M1-T06 Evidence and closure         | docs                                | T05          | Record fresh results and remaining limitations; confirm MVP1 scope before beginning MVP2                                               |

T03/T04 may result in no implementation change when existing tests already establish acceptance. Avoid adding tests that merely mirror code.

Exit gate: immutable install, `yarn check`, `yarn format:check`, Compose configuration and runtime smoke checks pass. No credentials/hardware are required for mock acceptance. SQLite integrity and foreign keys pass after restart; mock device resets are documented. Live OpenAI traffic, physical Pi validation and cross-browser PWA packaging remain explicit optional checks, not hidden completed work.

A live-provider smoke check, if undertaken, uses server-only credentials and records model, date and tool outcome; it does not enable real devices. Actual Pi resource/latency measurements may be deferred to hardware deployment but must be identified separately in evidence.
