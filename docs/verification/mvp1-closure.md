# MVP1 closure evidence

Verified 2026-10-10 on macOS with Node 24.18.0, Yarn 4.13.0 and the existing Colima Docker context (Linux aarch64). Base commit: `d48a0564700356d447f8c276dc0ad7fcd7f74e5f`; checks include uncommitted working-tree changes. No real cloud credentials, Home Assistant or physical devices were used.

| Check                                       | Result                                                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn install --immutable`                  | Passed                                                                                                                                                                            |
| `yarn check`                                | Passed: boundaries, production build, strict type checks, 24 tests in four suites                                                                                                 |
| `yarn format:check`                         | Passed, including final documentation formatting                                                                                                                                  |
| `docker info`                               | Existing Colima daemon available; configuration unchanged                                                                                                                         |
| `docker compose config --quiet`             | Passed                                                                                                                                                                            |
| `docker compose up --build -d --wait`       | Both ARM64 images rebuilt with immutable installs; services healthy                                                                                                               |
| `node scripts/verify-compose.mjs --restart` | Passed: health, proxied HTTP/WS chat, PWA asset serving, input/origin rejection, non-root ARM64 API, history/audit durability, SQLite integrity/foreign keys and mock-state reset |

Five regression tests fill previously uncovered acceptance scenarios: pending audit after execution finalization failure; accepted work continuing after socket disconnect; same-conversation contention between HTTP and WS; malformed WS requests followed by valid recovery; and public errors after partial streaming without partial assistant persistence. Existing tests cover default-deny tools, audit-before-execution failures, ordered persistence and the actual Strands loop using fixture SSE.

MVP1 backend/container exit checks pass. This evidence supports beginning the read-only MVP2 slice. It does not certify live provider calls or real devices. Browser runtime discovery returned no available browsers, so visual interaction, offline shell behavior and cross-browser PWA installation remain unverified; asset serving and service-worker API bypass were checked through HTTP/source inspection. Actual Raspberry Pi measurements remain outstanding.

The smoke script is dependency-free and repeatable using `yarn verify:compose`; `--restart` explicitly requests an API restart. It leaves its conversation/audit as evidence in the project volume and does not delete data or stop Colima.
