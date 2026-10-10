# Codex instructions — Home Intelligence Agent

Read README.md first. Build incrementally, beginning with MVP1. Do not implement all roadmap phases at once.

## Stack
TypeScript strict, Node.js current supported LTS, Yarn workspaces, Fastify, React/Vite, Strands Agents SDK, OpenAI, SQLite/Drizzle, Vitest, Docker Compose ARM64.

## Package boundaries
apps/api: HTTP and WebSocket transport.
apps/web: PWA.
apps/voice-satellite: audio transport and playback.
packages/domain: pure types, entities, ports.
packages/application: use cases.
packages/agent: Strands agent, tools, prompts and policies.
packages/integrations: Home Assistant, OpenAI, MQTT adapters.
packages/persistence: SQLite repositories.
packages/contracts: shared transport schemas.

Domain must not import framework or vendor SDKs. Prefer dependency injection at composition root. Validate untrusted tool arguments at runtime and authorize each physical operation before execution. Avoid exposing generic unrestricted Home Assistant service calls to the LLM.

## Engineering standards
- First inspect latest official SDK docs and pin compatible versions. Do not assume code snippets from the conversation are verified.
- Implement thin vertical slices with unit and integration tests.
- Keep secrets in environment/server-only config, never in web bundle.
- Include clear setup, healthcheck, logging, and local mock mode.
- Ask before introducing major dependencies or changing architecture.

## First task
Scaffold workspaces and implement an end-to-end chat request with a mocked device tool, persistence, and tests. Document how to run locally without Raspberry Pi or Home Assistant.

## Local Docker runtime (macOS)
- Use Colima to provide the Docker daemon. Check `docker info` before Docker validation.
- If the daemon is unavailable, check `colima status` and run `colima start` for the existing default profile, then retry `docker info`. Starting Colima when needed for this project's work is authorized; no additional conversational confirmation is needed. Sandbox approval requirements still apply.
- Use the existing Colima configuration. Do not delete or recreate the VM, change its resources, or stop Colima without explicit user instruction; other projects may share it.
- Once Docker is available, continue the requested container validation instead of reporting the daemon as a blocker. See README.md for the Compose workflow.
