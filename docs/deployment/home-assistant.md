# Home Assistant deployment and recovery

## Deployment decision

MVP2 uses Home Assistant Container separately from Aura. On macOS it runs under the existing Colima profile, on ARM64 with a persistent named volume, unprivileged bridge networking and loopback port 8123. Aura joins that private network through compose.home-assistant.yaml; only the API receives its token. The web proxy remains on localhost:8080. No Colima resource/configuration changes are needed.

The local configuration is an isolated test home, with two simulated template lights and no physical integrations. Read the official [Container installation guide](https://www.home-assistant.io/installation/linux/), [REST API](https://developers.home-assistant.io/docs/api/rest/), [authentication API](https://developers.home-assistant.io/docs/auth_api/) and [template integration](https://www.home-assistant.io/integrations/template/) for upstream details. Version 2026.10.1 is pinned from the [official release](https://github.com/home-assistant/core/releases/tag/2026.10.1); verify compatibility before future upgrades.

## Fresh Mac installation

From the repository root, after installing Node/Yarn dependencies:

```sh
docker info
yarn ha:up
yarn ha:config:check
yarn ha:setup
yarn deploy:ha:local
yarn verify:ha:local --resilience
```

If Docker is unavailable, follow AGENTS.md to start the existing Colima default profile. Do not recreate, resize or stop that shared VM.

The setup script only onboards the new isolated instance at 127.0.0.1:8123. It creates `aura_local` with a random password, completes onboarding and creates a long-lived integration token using HA's authentication APIs. It saves secrets to .env.home-assistant.local with mode 600 and prints no secret values. The pinned onboarding behavior was inspected in [official source](https://github.com/home-assistant/core/blob/2026.10.1/homeassistant/components/onboarding/views.py). It leaves existing accounts/configuration untouched and refuses ambiguous partial setup; use normal Home Assistant login/recovery rather than deleting its volume.

Open http://localhost:8123 and read the username/password from that local file to sign in. Open Aura at http://localhost:8080. The generated grants permit both local template lights. The Docker HA URL is http://homeassistant:8123; source development uses loopback via `yarn dev:api:ha:local`.

`verify:ha:local` tests real HA protocol behavior using this isolated test home. `--resilience` also restarts Aura and briefly stops/restarts only the HA service in the aura-home-assistant project. The script refuses an arbitrary home's location name/version, does not use OpenAI and leaves services running. Its template lights end off on success. Backend tests separately inject provider failure, invalid tokens, timeouts, unconfirmed states and malformed upstream data.

## Operation and recovery

- Status: `docker compose ps` for Aura; `docker compose -f deploy/home-assistant/compose.yaml ps` for HA. `/health` is local application/database health; `/devices` is the upstream connectivity/state check.
- Logs: `docker compose logs api web`; `docker compose -f deploy/home-assistant/compose.yaml logs homeassistant`. Do not dump Compose environment/configuration containing tokens into shared logs.
- Restart HA: `docker compose -f deploy/home-assistant/compose.yaml restart homeassistant`. Aura's next explicit read reconnects through REST; no persistent WS subscription is required. It never replays failed writes.
- Credential replacement: create a replacement token in HA's profile, update the server-only env file, recreate Aura with `yarn deploy:ha:local`, verify reads/control, then revoke the old token. Never rotate by deleting auth storage.
- Return to mocks: start the base Compose stack without the local HA env/overlay, with DEVICE_BACKEND=mock in any active root .env. HA can stay running separately. Preserve both volumes.
- Before migration/upgrade, snapshot SQLite using its backup API and back up the HA volume with HA stopped cleanly. Do not copy a live SQLite database file alone while WAL writes are active. Schema v2 is incompatible with the original v1 application; rollback requires the pre-upgrade snapshot and deliberately discards later writes, so inspect/export newer audit first. No automatic rollback/reset is performed.

A SQLite backup was taken before this implementation's container migration and is recorded in [verification evidence](../verification/mvp2.md). HA has a 60-second shutdown grace period. Stopping/removing containers without --volumes retains data; never delete a shared VM or these volumes as a routine fix.

## Raspberry Pi bring-up (deferred by user)

Use a supported 64-bit OS, Docker Compose and SSD storage on the Pi 5. The images and local HA deployment already target linux/arm64. Begin with the same simulated HA configuration and run the checks above before adding physical integrations. This validates software setup; it does not measure real hardware until run there.

Keep both Aura and HA host ports on loopback. Access from a development laptop through an authenticated SSH tunnel:

```sh
ssh -N -L 8080:127.0.0.1:8080 -L 8123:127.0.0.1:8123 user@pi-host
```

Browse localhost:8080 and localhost:8123 on the laptop. This preserves the configured browser origin and encrypts remote transport. Direct LAN/public Aura exposure, household identities and a TLS reverse proxy require a separately approved deployment design; origin checks alone are not authentication.

For an existing Home Assistant OS/Container host, configure its reachable URL and token instead of launching another instance. Replace test grants with explicitly chosen low-risk lights. Bridge networking does not provide host multicast discovery or USB/Bluetooth access; select actual integrations and their hardware mappings when the Pi is available rather than granting broad privileges now.

Before declaring hardware acceptance, run each allowed light on/off, inspect HA's observed state and Aura audit, unplug/reconnect the HA network, restart Aura/HA, and record Pi latency, memory, SSD durability and any integration-specific stale-state behavior. Preserve a safe route back to mock devices. Sensitive devices, MQTT and voice are outside MVP2.
