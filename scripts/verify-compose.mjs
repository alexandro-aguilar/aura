import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Uses only Node's standard library. Run against this project's mock Compose stack.
const restart = process.argv.includes('--restart');
assert(
  process.argv.slice(2).every((arg) => arg === '--restart'),
  'Unknown argument',
);
const api = 'http://127.0.0.1:3001';
const web = 'http://localhost:8080';
async function request(url, options) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
}
async function json(url, options) {
  const response = await request(url, options);
  assert.equal(response.status, 200, `${url}: ${response.status}`);
  return response.json();
}
function docker(...args) {
  return execFileSync('docker', ['compose', ...args], {
    encoding: 'utf8',
  }).trim();
}
const health = await json(`${api}/health`);
assert.deepEqual(health, { status: 'ok', mode: 'mock', devices: 'mock' });
assert.deepEqual(await json(`${web}/api/health`), health);
const html = await (await request(web)).text();
assert.match(html, /<div id="root"><\/div>/);
for (const asset of html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)) {
  const response = await request(new URL(asset[1], web));
  assert.equal(response.status, 200, asset[1]);
}
assert.equal(
  (await json(`${web}/manifest.webmanifest`)).name,
  'Aura Home Intelligence',
);
assert.match(
  await (await request(`${web}/sw.js`)).text(),
  /url.pathname.startsWith\('\/api'\)/,
);
assert.equal((await request(`${web}/icon.svg`)).status, 200);
const chat = await json(`${web}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: web },
  body: JSON.stringify({ message: 'turn on living room' }),
});
assert.equal(chat.message, 'Living room light is on (mock).');
assert.equal(
  (await json(`${api}/devices`)).find((d) => d.id === 'light.living_room')
    .state,
  'on',
);
assert.equal(
  (
    await request(`${web}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '', grants: ['*'] }),
    })
  ).status,
  400,
);
assert.equal(
  (
    await request(`${web}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://untrusted.example',
      },
      body: JSON.stringify({ message: 'turn off living room' }),
    })
  ).status,
  403,
);

const events = await new Promise((resolve, reject) => {
  const socket = new WebSocket('ws://localhost:8080/api/chat/stream');
  const received = [];
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error('WebSocket timeout'));
  }, 5000);
  socket.addEventListener('open', () =>
    socket.send(
      JSON.stringify({
        conversationId: chat.conversationId,
        message: 'status',
      }),
    ),
  );
  socket.addEventListener('error', () => {
    clearTimeout(timer);
    socket.close();
    reject(new Error('WebSocket failed'));
  });
  socket.addEventListener('message', ({ data }) => {
    try {
      const event = JSON.parse(data);
      received.push(event);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') {
        clearTimeout(timer);
        socket.close();
        resolve(received);
      }
    } catch (error) {
      clearTimeout(timer);
      socket.close();
      reject(error);
    }
  });
});
assert.equal(events[0].type, 'started');
assert.equal(events.at(-1).conversationId, chat.conversationId);
assert.equal(
  events
    .filter((e) => e.type === 'delta')
    .map((e) => e.text)
    .join(''),
  events.at(-1).message,
);
const history = await json(
  `${api}/conversations/${chat.conversationId}/messages`,
);
const direct = await json(`${web}/api/device-operations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: web },
  body: JSON.stringify({ deviceId: 'light.bedroom', state: 'on' }),
});
assert.equal(direct.device.state, 'on');
const directAuditUrl = `${web}/api/conversations/${direct.conversationId}/audit`;
const directAudit = await json(directAuditUrl);
assert.equal(directAudit[0].id, direct.operationId);
assert.equal(directAudit[0].status, 'succeeded');
const denied = await request(`${web}/api/device-operations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: web },
  body: JSON.stringify({ deviceId: 'light.ungranted', state: 'on' }),
});
assert.equal(denied.status, 403);
const deniedBody = await denied.json();
assert.equal(
  (await json(`${web}/api/conversations/${deniedBody.conversationId}/audit`))[0]
    .status,
  'denied',
);
assert.deepEqual(
  history.map((m) => m.role),
  ['user', 'assistant', 'user', 'assistant'],
);

function inspectStorage() {
  return JSON.parse(
    docker(
      'exec',
      '-T',
      'api',
      'node',
      '-e',
      `
    const Database = require('better-sqlite3');
    const db = new Database(process.env.DATABASE_PATH, { readonly: true });
    const audit = db.prepare('SELECT device_id, state, status FROM execution_audit WHERE conversation_id = ? ORDER BY sequence').all(process.argv[1]);
    console.log(JSON.stringify({
      audit,
      integrity: db.pragma('integrity_check'),
      foreignKeys: db.pragma('foreign_key_check'),
      uid: process.getuid(), architecture: process.arch
    }));
    db.close();
  `,
      chat.conversationId,
    ),
  );
}
const storage = inspectStorage();
assert.deepEqual(storage.audit, [
  { device_id: 'light.living_room', state: 'on', status: 'succeeded' },
]);
assert.deepEqual(storage.integrity, [{ integrity_check: 'ok' }]);
assert.deepEqual(storage.foreignKeys, []);
assert.notEqual(storage.uid, 0);
assert.equal(storage.architecture, 'arm64');
if (restart) {
  docker('restart', 'api');
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await json(`${api}/health`);
      ready = true;
      break;
    } catch {
      await delay(500);
    }
  }
  assert(ready, 'API did not recover after restart');
  assert.deepEqual(
    await json(`${api}/conversations/${chat.conversationId}/messages`),
    history,
  );
  assert.deepEqual(inspectStorage(), storage);
  assert.deepEqual(await json(directAuditUrl), directAudit);
  assert.equal(
    (await json(`${api}/devices`)).find((d) => d.id === 'light.living_room')
      .state,
    'off',
  );
}
console.log(
  `Compose smoke checks passed${restart ? ' including restart durability' : ''}. Conversation: ${chat.conversationId}`,
);
