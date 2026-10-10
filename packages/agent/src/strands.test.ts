import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OpenAIModel } from '@strands-agents/sdk/models/openai';
import type {
  AuditEntry,
  AuditRepository,
  DeviceGateway,
  LightOperation,
} from '@aura/domain';
import { DeviceTools, MockLightPolicy } from '@aura/application';
import { StrandsChatAgent } from './strands.js';

afterEach(() => vi.unstubAllGlobals());

// Exercises the real pinned SDK and provider protocol without a network call or API key.
it('runs the Strands tool loop against fixture OpenAI SSE responses', async () => {
  const entries: AuditEntry[] = [];
  const audit: AuditRepository = {
    record: (entry) => {
      entries.push(entry);
    },
    finish: (id, status) => {
      const entry = entries.find((entry) => entry.id === id);
      if (entry) entry.status = status;
    },
    list: () => entries,
  };
  const devices: DeviceGateway = {
    list: async () => [
      { id: 'light.living_room', name: 'Living room', state: 'off' },
    ],
    setLight: vi.fn(async ({ deviceId, state }: LightOperation) => ({
      id: deviceId,
      name: 'Living room',
      state,
    })),
  };
  const tools = new DeviceTools(
    devices,
    new MockLightPolicy(new Set(['light.living_room'])),
    audit,
    { id: randomUUID, now: () => new Date().toISOString() },
  );
  const frames = (delta: unknown, finishReason: string) => {
    const chunk = (value: unknown, finish: string | null) => ({
      id: 'fixture',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'fixture-model',
      choices: [{ index: 0, delta: value, finish_reason: finish }],
    });
    return `data: ${JSON.stringify(chunk(delta, null))}\n\ndata: ${JSON.stringify(chunk({}, finishReason))}\n\ndata: [DONE]\n\n`;
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        frames(
          {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_fixture',
                type: 'function',
                function: {
                  name: 'set_light',
                  arguments: JSON.stringify({
                    deviceId: 'light.living_room',
                    state: 'on',
                  }),
                },
              },
            ],
          },
          'tool_calls',
        ),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        frames(
          { role: 'assistant', content: 'Living room light is on (mock).' },
          'stop',
        ),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const model = new OpenAIModel({
    api: 'chat',
    apiKey: 'fixture-only',
    modelId: 'fixture-model',
  });
  const agent = new StrandsChatAgent(model, tools);
  let response = '';
  for await (const text of agent.stream({
    conversationId: randomUUID(),
    message: 'Turn on living room',
    history: [],
  }))
    response += text;
  expect(response).toBe('Living room light is on (mock).');
  expect(devices.setLight).toHaveBeenCalledExactlyOnceWith({
    deviceId: 'light.living_room',
    state: 'on',
  });
  expect(entries).toMatchObject([{ status: 'succeeded' }]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
