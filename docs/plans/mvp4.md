# MVP4 plan — wake word, memory and automations

Status: proposed, with three independently accepted slices. Entry requires MVP3 exit. Requirements P-09–11; preserve all earlier safety boundaries. Do not enable all slices together.

| Task                               | Owner packages                                   | Depends on           | Deliverable and acceptance                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4-T01 Wake-word design            | voice-satellite, docs                            | MVP3 exit            | Compare supported local engines using official docs; resolve licensing, hardware budget, language and activation feedback; obtain approval for major dependencies   |
| M4-T02 Wake-word implementation    | voice-satellite, contracts, api                  | T01                  | Local detection, explicit mute and capture indicators; feed the existing voice pipeline; measure false activation, missed activation and playback echo on Pi        |
| M4-T03 Memory design and migration | domain, application, persistence, contracts      | MVP3 exit            | Specify approved preference categories, provenance, retention, inspect/edit/delete UX and versioned schema migration; define context/token limits                   |
| M4-T04 Explicit memory slice       | application, agent, persistence, api, web        | T03                  | User-approved memory write/retrieval/removal with restart and deletion tests; retrieved content is untrusted and cannot grant permissions                           |
| M4-T05 Automation design           | domain, application, integrations, docs          | MVP3 exit            | Select events/actions and ownership; define disabled-by-default rules, dry-run, deduplication, cooldowns, maximum rates, stale-event handling and emergency disable |
| M4-T06 Automation slice            | application, integrations, persistence, api, web | T05                  | Deliver one allowlisted event → policy → audited operation path with deterministic clock/event tests, replay/loop protection and inspect/disable UI                 |
| M4-T07 Acceptance and rollout      | All affected, docs                               | Each completed slice | Record independent evidence and configuration switches; enable one capability at a time on target hardware                                                          |

The table permits independent design work; implement only the selected slice until its exit checks pass. Add MQTT only if the chosen event source requires it and its dependency/configuration implications have been reviewed. Prefer deterministic explicit rules before any LLM-proposed automation. Natural-language suggestions must never activate a rule without explicit approval.

Wake-word acceptance requires reliable mute behavior and no cloud upload before activation under the chosen design. Agree numeric detection/latency targets after hardware measurement; do not invent guarantees. Memory acceptance requires transparent provenance, explicit consent and deletion from active storage/context, with backup retention explained. Automation acceptance requires bounded execution, restart-safe deduplication, an emergency disable path and the existing pending-first audit.

Sensitive-action expansion is excluded. If requested later, first specify caller identity, exact operation binding, expiry, single-use confirmation, replay protection and safe failure behavior. Model-generated confirmation text alone is insufficient authorization.

Exit is per slice: fixtures and failure tests pass, Pi behavior is measured, setup/recovery docs are current, and previous chat/direct/voice acceptance remains intact. Unselected slices remain proposed.
