import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  chmodSync,
} from 'node:fs';
import { parseEnv } from 'node:util';

const url = 'http://127.0.0.1:8123';
const clientId = 'http://localhost:8123/';
const filename = new URL('../.env.home-assistant.local', import.meta.url);
async function request(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
  });
  assert(
    response.ok,
    `Home Assistant setup failed: ${path} returned ${response.status}`,
  );
  return response.json();
}
if (existsSync(filename)) {
  const saved = parseEnv(readFileSync(filename, 'utf8'));
  if (saved.HA_TOKEN) {
    await request('/api/', {
      headers: { Authorization: `Bearer ${saved.HA_TOKEN}` },
    });
    chmodSync(filename, 0o600);
    console.log(
      'Existing local Home Assistant credentials work; no account or token changed.',
    );
    process.exit(0);
  }
  throw new Error(
    'Incomplete local credentials file exists. Recover the account through Home Assistant; do not reset its volume.',
  );
}
const onboarding = await request('/api/onboarding');
assert(
  Array.isArray(onboarding) &&
    onboarding.some((step) => step.step === 'user' && !step.done),
  'This script only onboards a new isolated Home Assistant instance.',
);
const password = randomBytes(24).toString('base64url');
const username = 'aura_local';
let contents = `# Local isolated Home Assistant credentials. Never commit or copy to a web bundle.\nHA_LOCAL_USERNAME=${username}\nHA_LOCAL_PASSWORD=${password}\n`;
writeFileSync(filename, contents, { flag: 'wx', mode: 0o600 });
const user = await request('/api/onboarding/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Aura Local',
    username,
    password,
    client_id: clientId,
    language: 'en',
  }),
});
const tokens = await request('/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: user.auth_code,
    client_id: clientId,
  }),
});
const authHeaders = {
  Authorization: `Bearer ${tokens.access_token}`,
  'Content-Type': 'application/json',
};
for (const [step, body] of [
  ['core_config', {}],
  ['analytics', {}],
  ['integration', { client_id: clientId, redirect_uri: clientId }],
]) {
  await request(`/api/onboarding/${step}`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(body),
  });
}
const token = await new Promise((resolve, reject) => {
  const socket = new WebSocket('ws://127.0.0.1:8123/api/websocket');
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error('Home Assistant token setup timed out.'));
  }, 30000);
  const finish = (error, value) => {
    clearTimeout(timer);
    socket.close();
    error ? reject(error) : resolve(value);
  };
  socket.addEventListener('error', () =>
    finish(new Error('Home Assistant token connection failed.')),
  );
  socket.addEventListener('message', ({ data }) => {
    try {
      const event = JSON.parse(data);
      if (event.type === 'auth_required')
        socket.send(
          JSON.stringify({ type: 'auth', access_token: tokens.access_token }),
        );
      if (event.type === 'auth_ok')
        socket.send(
          JSON.stringify({
            id: 1,
            type: 'auth/long_lived_access_token',
            client_name: 'Aura Local Integration',
            lifespan: 365,
          }),
        );
      if (event.type === 'auth_invalid')
        finish(new Error('Home Assistant rejected setup authentication.'));
      if (event.id === 1)
        event.success && typeof event.result === 'string'
          ? finish(null, event.result)
          : finish(new Error('Home Assistant token creation failed.'));
    } catch {
      finish(new Error('Home Assistant returned an invalid token response.'));
    }
  });
});
contents += `AGENT_MODE=mock\nDEVICE_BACKEND=home-assistant\nHA_URL=http://homeassistant:8123\nHA_TOKEN=${token}\nHA_LIGHT_IDS=light.aura_living_room,light.aura_bedroom\nHA_WRITE_LIGHT_IDS=light.aura_living_room,light.aura_bedroom\nHA_TIMEOUT_MS=5000\nHA_CONFIRMATION_TIMEOUT_MS=3000\n`;
const temporary = new URL('../.env.home-assistant.local.tmp', import.meta.url);
writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
renameSync(temporary, filename);
console.log(
  'Home Assistant onboarded. Username, password and token saved in .env.home-assistant.local (mode 600); no secrets printed.',
);
