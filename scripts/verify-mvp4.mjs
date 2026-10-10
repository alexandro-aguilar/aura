import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const restart = process.argv.includes('--restart');
assert(
  process.argv.slice(2).every((arg) => arg === '--restart'),
  'Unknown argument',
);
const base = process.env.AURA_API_URL ?? 'http://127.0.0.1:3001';
async function request(path, body, method = 'POST') {
  const response = await fetch(new URL(path, base), {
    method,
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(
    response.status,
    method === 'DELETE' ? 204 : 200,
    `${path}: ${response.status}`,
  );
  return response.status === 204 ? undefined : response.json();
}
const get = (path) => request(path, undefined, 'GET');
assert.deepEqual(await get('/health'), {
  status: 'ok',
  mode: 'mock',
  devices: 'mock',
});
const initial = await get('/automations');
const memory = await get('/preferences');
assert(
  initial.available && memory.enabled,
  'Enable only the isolated mock test stack’s memory and automation flags.',
);
assert(
  !initial.enabled &&
    initial.rules.length === 0 &&
    memory.preferences.length === 0,
  'Use an empty disposable database; existing rules/preferences will not be changed.',
);
const saved = await request('/preferences', {
  category: 'response_language',
  value: 'es',
  consent: true,
});
assert.match(
  (await request('/chat', { message: 'show preferences' })).message,
  /response_language: es/,
);
await request('/device-operations', {
  deviceId: 'light.living_room',
  state: 'off',
});
await request('/device-operations', {
  deviceId: 'light.bedroom',
  state: 'off',
});
const rule = await request('/automations', {
  name: 'Container fixture',
  trigger: { deviceId: 'light.living_room', state: 'on' },
  action: { deviceId: 'light.bedroom', state: 'on' },
  cooldownSeconds: 60,
});
assert.equal(rule.enabled, false);
const event = {
  id: randomUUID(),
  deviceId: 'light.living_room',
  from: 'off',
  to: 'on',
  observedAt: new Date().toISOString(),
};
assert.equal(
  (await request(`/automations/${rule.id}/dry-run`, event)).matches,
  true,
);
assert.deepEqual((await get('/automations')).runs, initial.runs);
await request(`/automations/${rule.id}/activation`, {
  enabled: true,
  consent: true,
});
await request('/automations/control', { enabled: true, consent: true });
await delay(1500); // First snapshot is a baseline, not an event.
await request('/device-operations', {
  deviceId: 'light.living_room',
  state: 'on',
});
let receipt;
for (let i = 0; i < 20; i++) {
  receipt = (await get('/automations')).runs.find(
    (run) => run.rule.id === rule.id,
  );
  if (receipt?.status === 'succeeded') break;
  await delay(500);
}
assert.equal(receipt?.status, 'succeeded');
assert.equal(receipt.rule.id, rule.id);
assert.equal(
  (await get('/devices')).find((device) => device.id === 'light.bedroom').state,
  'on',
);
assert.equal(
  (await get(`/conversations/${receipt.conversationId}/audit`))[0].id,
  receipt.operationId,
);
await request('/automations/control', { enabled: false });
const completedRuns = (await get('/automations')).runs;
async function restartApi() {
  execFileSync('docker', ['compose', 'restart', 'api'], { stdio: 'pipe' });
  for (let i = 0; i < 30; i++) {
    try {
      await get('/health');
      return;
    } catch {
      await delay(500);
    }
  }
  throw new Error('API restart failed');
}
if (restart) {
  await restartApi();
  assert.deepEqual((await get('/preferences')).preferences, [saved]);
  const restored = await get('/automations');
  assert.equal(restored.enabled, false);
  assert.equal(restored.rules[0].enabled, true);
  assert.deepEqual(restored.runs, completedRuns);
}
await request(`/preferences/${saved.id}`, undefined, 'DELETE');
await request(`/automations/${rule.id}`, undefined, 'DELETE');
if (restart) await restartApi();
assert.deepEqual((await get('/preferences')).preferences, []);
assert.doesNotMatch(
  (await request('/chat', { message: 'show preferences' })).message,
  /response_language: es/,
);
assert.deepEqual((await get('/automations')).rules, []);
assert.equal((await get('/automations')).enabled, false);
console.log(
  `MVP4 mock smoke passed${restart ? ' including activation, receipt, deletion and emergency-stop restart durability' : ''}. Audit conversation: ${receipt.conversationId}`,
);
