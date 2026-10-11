# Project specifications

These documents define Aura's intended behavior and phase boundaries. Read the [product specification](product.md), [architecture specification](architecture.md), and [MVP1 specification](mvp1.md), then follow the [delivery plan](../implementation-plan.md).

| Document                                         | Purpose                                                           | Status                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| [Product](product.md)                            | Users, requirements, constraints, roadmap acceptance              | Project baseline                                               |
| [Architecture](architecture.md)                  | Package ownership, trust boundaries, data and execution rules     | Current architecture plus labeled future requirements          |
| [MVP1](mvp1.md)                                  | Implemented chat, mock tools, persistence and transport contracts | Baseline derived from source on 2026-10-10                     |
| [MVP2](mvp2.md)                                  | Authorized HA lights, direct controls, audit and local deployment | Implemented; actual local HA with simulated lights             |
| [MVP2 verification](../verification/mvp2.md)     | Tests, container checks and acceptance limitations                | Current evidence; Pi deferred                                  |
| [HA deployment](../deployment/home-assistant.md) | Mac setup, recovery and later Pi bring-up                         | Local deployment verified                                      |
| [MVP2 read-only slice](mvp2-read-only.md)        | Historical first-slice contract                                   | Superseded by full MVP2 specification                          |
| [MVP1 closure plan](../plans/mvp1.md)            | Validate the existing slice and record remaining limitations      | Backend/container closure recorded; browser checks open        |
| [MVP2 plan](../plans/mvp2.md)                    | Safe Home Assistant control and deterministic local controls      | Implemented and locally verified; Pi acceptance deferred       |
| [MVP3 plan](../plans/mvp3.md)                    | Push-to-talk and physical voice satellite                         | Software implemented; browser/live speech/Pi checks open       |
| [MVP3](mvp3.md)                                  | Bounded speech, browser capture, satellite transport and recovery | Software contract and remaining acceptance                     |
| [Voice setup](../deployment/voice.md)            | Mock/OpenAI setup, Linux ALSA and satellite authentication        | Local workflow and hardware acceptance                         |
| [MVP4 plan](../plans/mvp4.md)                    | Wake word, explicit memory and bounded automation                 | Software implemented; independent hardware acceptance open     |
| [Frontend design](frontend-design.md)            | CSS visual language, tokens, materials, states and accessibility  | LG-01–LG-06 locally complete; manual device/zoom checks remain |

Requirement IDs are stable references for tasks and tests. “Must” describes acceptance requirements; future-phase requirements do not imply implementation today. Source code establishes the current behavior; discrepancies with requirements become explicit tasks rather than undocumented changes. README owns run commands; the SDK compatibility record owns historical SDK evidence. Recheck official documentation before changing SDK usage or versions.

The phase plans specify implementation order, ownership, tests and exit gates. Open choices must be resolved in the phase that needs them. No later-phase plan authorizes new major dependencies or architecture changes without the approval required by AGENTS.md.

MVP4: [specification](mvp4.md), [setup](../deployment/mvp4.md), [verification](../verification/mvp4.md).
