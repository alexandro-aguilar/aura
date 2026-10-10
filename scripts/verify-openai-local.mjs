import assert from 'node:assert/strict';

assert.deepEqual(
  process.argv.slice(2),
  ['--live'],
  'Pass --live to authorize paid OpenAI requests.',
);
assert(
  process.env.AGENT_MODE === 'openai' && process.env.OPENAI_API_KEY,
  'Load the server-only OpenAI environment first.',
);
const base = 'http://localhost:8080/api';
const light = 'light.aura_living_room';
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(120000),
  });
  assert.equal(
    response.status,
    200,
    `Unexpected HTTP ${response.status} at ${path}`,
  );
  return response.json();
}
function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:8080',
    },
    body: JSON.stringify(body),
  });
}
async function ha(path) {
  const response = await fetch(`http://127.0.0.1:8123${path}`, {
    headers: { Authorization: `Bearer ${process.env.HA_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, 'Local HA read failed');
  return response.json();
}
const configuration = await ha('/api/config');
assert.equal(
  configuration.location_name,
  'Aura Local Test Home',
  'Refusing arbitrary home.',
);
assert.equal(configuration.version, '2026.10.1');
assert.deepEqual(await request('/health'), {
  status: 'ok',
  mode: 'openai',
  devices: 'home-assistant',
});
const devices = await request('/devices');
assert.deepEqual(devices.map((d) => d.id).sort(), [
  'light.aura_bedroom',
  light,
]);
assert(devices.every((d) => d.canControl));
await post('/device-operations', { deviceId: light, state: 'off' });
const marker = `validation-${crypto.randomUUID()}`;
console.log(
  'Starting four live chat turns with the configured model and local simulated HA lights.',
);
const discovery = await post('/chat', {
  message: `Remember this test marker: ${marker}. Use list_devices now and list the exact allowed light IDs. Do not change any light. Keep your answer under 60 words.`,
});
assert(
  discovery.message.includes(light) &&
    discovery.message.includes('light.aura_bedroom'),
  'Discovery did not report allowed lights.',
);
assert.equal(
  (await request(`/conversations/${discovery.conversationId}/audit`)).length,
  0,
);
console.log('Live HTTP discovery passed.');
const conversationId = discovery.conversationId;
const on = await post('/chat', {
  conversationId,
  message: `Turn on ${light} using set_light exactly once. Include the test marker from my previous message and the result. Keep your answer under 60 words.`,
});
assert(on.message.includes(marker), 'Conversation context was not recalled.');
assert.equal((await ha(`/api/states/${light}`)).state, 'on');
let audit = await request(`/conversations/${conversationId}/audit`);
assert.equal(audit.length, 1);
assert.equal(audit[0].deviceId, light);
assert.equal(audit[0].state, 'on');
assert.equal(audit[0].status, 'succeeded');
console.log(
  'Live tool execution, HA state, audit and conversation context passed.',
);
const streamed = await new Promise((resolve, reject) => {
  const socket = new WebSocket('ws://localhost:8080/api/chat/stream');
  let text = '';
  let started = false;
  const timer = setTimeout(
    () => finish(new Error('Live stream timed out')),
    120000,
  );
  function finish(error, value) {
    clearTimeout(timer);
    socket.close();
    if (error) reject(error);
    else resolve(value);
  }
  socket.addEventListener('open', () =>
    socket.send(
      JSON.stringify({
        conversationId,
        message: `Turn off ${light} using set_light exactly once. State the result in under 40 words.`,
      }),
    ),
  );
  socket.addEventListener('error', () =>
    finish(new Error('Live stream connection failed')),
  );
  socket.addEventListener('close', () => {
    clearTimeout(timer);
    reject(new Error('Live stream closed before completion'));
  });
  socket.addEventListener('message', ({ data }) => {
    try {
      const event = JSON.parse(data);
      if (event.type === 'started') {
        assert.equal(event.conversationId, conversationId);
        started = true;
      }
      if (event.type === 'delta') text += event.text;
      if (event.type === 'error')
        throw new Error(`Live stream failed: ${event.code}`);
      if (event.type === 'done') {
        assert(started && text.length > 0);
        assert.equal(event.message, text);
        finish(null, event.message);
      }
    } catch (error) {
      finish(error);
    }
  });
});
assert(streamed.length > 0);
assert.equal((await ha(`/api/states/${light}`)).state, 'off');
audit = await request(`/conversations/${conversationId}/audit`);
assert.deepEqual(
  audit.map((entry) => [entry.deviceId, entry.state, entry.status]),
  [
    [light, 'on', 'succeeded'],
    [light, 'off', 'succeeded'],
  ],
);
console.log('Live WebSocket text streaming and off tool execution passed.');
const denied = await post('/chat', {
  conversationId,
  message:
    'Turn on light.ungranted. If you cannot, explain briefly. Do not operate another light. Keep your answer under 40 words.',
});
assert(denied.message.trim());
audit = await request(`/conversations/${conversationId}/audit`);
assert.equal(audit.filter((entry) => entry.status === 'succeeded').length, 2);
assert(
  audit
    .slice(2)
    .every(
      (entry) =>
        entry.deviceId === 'light.ungranted' && entry.status === 'denied',
    ),
);
assert.equal((await ha(`/api/states/${light}`)).state, 'off');
const history = await request(`/conversations/${conversationId}/messages`);
assert.equal(history.length, 8);
assert.deepEqual(
  history.map((m) => m.role),
  Array.from({ length: 4 }, () => ['user', 'assistant']).flat(),
);
assert.equal(history.at(-1).content, denied.message);
console.log(
  `Live authorization boundary and persisted history passed. ${audit.length - 2 ? 'An attempted ungranted write was denied and audited.' : 'The model declined the ungranted write without dispatch.'}`,
);
const direct = await post('/device-operations', {
  deviceId: light,
  state: 'off',
});
assert.equal(direct.device.state, 'off');
console.log(
  'Live OpenAI validation passed: four chat turns, HTTP/WS, HA on/off, context, history, audit and direct controls.',
);
