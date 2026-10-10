import assert from 'node:assert/strict';
import { pcmToWav, encodeBase64, readVoiceEvents } from '@aura/contracts';
import { runVoiceTurn } from '../apps/voice-satellite/dist/index.js';

const origin = process.env.VOICE_WEB_ORIGIN ?? 'http://localhost:8080';
const base = process.env.AURA_API_URL ?? 'http://127.0.0.1:3001';
const health = await fetch(`${base}/health`).then((r) => r.json());
const capability = await fetch(`${base}/voice/capabilities`).then((r) =>
  r.json(),
);
assert.equal(
  health.mode,
  'mock',
  'Voice smoke check refuses paid agent requests',
);
assert.equal(
  capability.mode,
  'mock',
  'Voice smoke check refuses paid speech requests',
);
const wav = pcmToWav(new Uint8Array(32000));
const response = await fetch(`${base}/voice/turn`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', origin },
  body: JSON.stringify({ audioBase64: encodeBase64(wav) }),
  signal: AbortSignal.timeout(10000),
});
const events = [];
for await (const event of readVoiceEvents(response)) events.push(event);
assert.equal(events[0].type, 'accepted');
assert.equal(events.at(-1).type, 'done');
assert.equal(
  events.find((event) => event.type === 'transcript')?.text,
  'status',
);
assert.ok(events.some((event) => event.type === 'audio'));
const id = events[0].conversationId;
const history = await fetch(`${base}/conversations/${id}/messages`).then((r) =>
  r.json(),
);
assert.equal(history.length, 2);
assert.equal(history[0].content, 'status');
assert.deepEqual(
  await fetch(`${base}/conversations/${id}/audit`).then((r) => r.json()),
  [],
);
if (process.env.SATELLITE_TOKEN) {
  let played = false;
  await runVoiceTurn({
    url: base,
    token: process.env.SATELLITE_TOKEN,
    signal: AbortSignal.timeout(10000),
    capture: async () => wav,
    play: async (audio) => {
      assert.equal(new TextDecoder().decode(audio.subarray(0, 4)), 'RIFF');
      played = true;
    },
    onEvent: () => {},
  });
  assert.ok(played);
  console.log('Authenticated satellite fixture passed.');
}
console.log(
  `Voice HTTP recognition/chat/persistence/playback fixture passed (${id}). No paid requests or raw audio files.`,
);
