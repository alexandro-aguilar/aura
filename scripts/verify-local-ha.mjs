import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const resilience = process.argv.includes('--resilience');
assert(
  process.argv.slice(2).every((arg) => arg === '--resilience'),
  'Unknown argument',
);
assert(
  process.env.DEVICE_BACKEND === 'home-assistant' && process.env.HA_TOKEN,
  'Load .env.home-assistant.local first.',
);
const web = 'http://localhost:8080/api';
const localHA = 'http://127.0.0.1:8123';
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
}
async function json(url, options) {
  const response = await request(url, options);
  assert.equal(
    response.status,
    200,
    `Unexpected status ${response.status} at ${new URL(url).pathname}`,
  );
  return response.json();
}
async function ha(path) {
  return json(`${localHA}${path}`, {
    headers: { Authorization: `Bearer ${process.env.HA_TOKEN}` },
  });
}
function compose(...args) {
  execFileSync(
    'docker',
    [
      'compose',
      '--env-file',
      '.env.home-assistant.local',
      '-f',
      'compose.yaml',
      '-f',
      'compose.home-assistant.yaml',
      ...args,
    ],
    { stdio: 'inherit' },
  );
}
function homeAssistant(...args) {
  execFileSync(
    'docker',
    ['compose', '-f', 'deploy/home-assistant/compose.yaml', ...args],
    { stdio: 'inherit' },
  );
}
function control(deviceId, state) {
  return json(`${web}/device-operations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:8080',
    },
    body: JSON.stringify({ deviceId, state }),
  });
}
const configuration = await ha('/api/config');
assert.equal(
  configuration.location_name,
  'Aura Local Test Home',
  'Refusing to write against an arbitrary Home Assistant home.',
);
assert.equal(configuration.version, '2026.10.1');
assert.deepEqual(await json(`${web}/health`), {
  status: 'ok',
  mode: 'mock',
  devices: 'home-assistant',
});
const devices = await json(`${web}/devices`);
assert.deepEqual(devices.map((d) => d.id).sort(), [
  'light.aura_bedroom',
  'light.aura_living_room',
]);
assert(devices.every((d) => d.canControl === true));
const direct = await control('light.aura_living_room', 'on');
assert.equal(direct.device.state, 'on');
assert.equal((await ha('/api/states/light.aura_living_room')).state, 'on');
const auditUrl = `${web}/conversations/${direct.conversationId}/audit`;
const audit = await json(auditUrl);
assert.equal(audit[0].id, direct.operationId);
assert.equal(audit[0].status, 'succeeded');
const chat = await json(`${web}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'turn off light.aura_living_room' }),
});
assert.equal(chat.message, 'Aura Living Room light is off.');
assert.equal((await ha('/api/states/light.aura_living_room')).state, 'off');
const history = await json(
  `${web}/conversations/${chat.conversationId}/messages`,
);
assert.deepEqual(
  history.map((m) => m.role),
  ['user', 'assistant'],
);
await new Promise((resolve, reject) => {
  const socket = new WebSocket('ws://localhost:8080/api/chat/stream');
  const timeout = setTimeout(() => {
    socket.close();
    reject(new Error('Streaming timed out'));
  }, 15000);
  socket.addEventListener('open', () =>
    socket.send(JSON.stringify({ message: 'turn on light.aura_bedroom' })),
  );
  socket.addEventListener('error', () => {
    clearTimeout(timeout);
    socket.close();
    reject(new Error('Streaming failed'));
  });
  socket.addEventListener('message', ({ data }) => {
    try {
      const event = JSON.parse(data);
      if (event.type === 'error') throw new Error('Stream returned an error');
      if (event.type === 'done') {
        clearTimeout(timeout);
        socket.close();
        assert.equal(event.message, 'Aura Bedroom light is on.');
        resolve();
      }
    } catch (error) {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    }
  });
});
assert.equal((await ha('/api/states/light.aura_bedroom')).state, 'on');
const denied = await request(`${web}/device-operations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ deviceId: 'light.ungranted', state: 'on' }),
});
assert.equal(denied.status, 403);
const deniedBody = await denied.json();
assert.equal(
  (await json(`${web}/conversations/${deniedBody.conversationId}/audit`))[0]
    .status,
  'denied',
);
if (resilience) {
  compose('restart', 'api');
  compose('start', '--wait', 'api');
  assert.deepEqual(await json(auditUrl), audit);
  assert.deepEqual(
    await json(`${web}/conversations/${chat.conversationId}/messages`),
    history,
  );
  assert.equal((await ha('/api/states/light.aura_bedroom')).state, 'on');
  let stopped = false;
  try {
    homeAssistant('stop', 'homeassistant');
    stopped = true;
    assert.equal((await request(`${web}/health`)).status, 200);
    assert.equal((await request(`${web}/devices`)).status, 503);
    const failed = await request(`${web}/device-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'light.aura_living_room', state: 'on' }),
    });
    assert.equal(failed.status, 503);
    const failure = await failed.json();
    assert.equal(failure.code, 'DEVICE_UNAVAILABLE');
    assert.equal(
      (await json(`${web}/conversations/${failure.conversationId}/audit`))[0]
        .status,
      'failed',
    );
  } finally {
    if (stopped) homeAssistant('start', '--wait', 'homeassistant');
  }
  assert.equal((await request(`${web}/devices`)).status, 200);
  assert.deepEqual(await json(auditUrl), audit);
}
await control('light.aura_bedroom', 'off');
console.log(
  `Real local Home Assistant checks passed${resilience ? ', including API restart and HA outage/recovery' : ''}. No physical devices or OpenAI requests used.`,
);
