import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  AuditEntry,
  AuditRepository,
  ChatAgent,
  Conversation,
  ConversationRepository,
  DeviceGateway,
  Message,
} from '@aura/domain';
import { ChatService, DeviceTools, MockLightPolicy } from './index.js';

const runtime = { id: randomUUID, now: () => '2026-10-10T12:00:00.000Z' };
function memory() {
  const conversations = new Map<string, Conversation>();
  const messages: Message[] = [];
  const entries: AuditEntry[] = [];
  const repository: ConversationRepository = {
    create: (item) => {
      conversations.set(item.id, item);
    },
    exists: (id) => conversations.has(id),
    messages: (id) => messages.filter((item) => item.conversationId === id),
    append: (item) => {
      messages.push(item);
    },
  };
  const audit: AuditRepository = {
    record: (item) => {
      entries.push(item);
    },
    finish: (id, status) => {
      const item = entries.find((item) => item.id === id);
      if (item) item.status = status;
    },
    list: (id) => entries.filter((item) => item.conversationId === id),
  };
  return { repository, audit, entries, messages };
}
async function collect<T>(stream: AsyncIterable<T>) {
  const result: T[] = [];
  for await (const item of stream) result.push(item);
  return result;
}

describe('device operation boundary', () => {
  function setup() {
    const storage = memory();
    const devices: DeviceGateway = {
      list: vi.fn(async () => []),
      setLight: vi.fn(async (operation) => ({
        id: operation.deviceId,
        name: 'Light',
        state: operation.state,
      })),
    };
    const tools = new DeviceTools(
      devices,
      new MockLightPolicy(new Set(['light.living_room'])),
      storage.audit,
      runtime,
    );
    return { ...storage, devices, tools };
  }
  it('validates untrusted input before execution', async () => {
    const { tools, devices } = setup();
    await expect(
      tools.setLight('conversation', {
        deviceId: 'light.living_room',
        state: 'unlock',
      }),
    ).rejects.toThrow();
    await expect(
      tools.setLight('conversation', {
        deviceId: 'light.living_room',
        state: 'on',
        service: 'shell',
      }),
    ).rejects.toThrow();
    expect(devices.setLight).not.toHaveBeenCalled();
  });
  it('denies unknown devices and records the denial', async () => {
    const { tools, devices, entries } = setup();
    await expect(
      tools.setLight('conversation', {
        deviceId: 'lock.front_door',
        state: 'on',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(devices.setLight).not.toHaveBeenCalled();
    expect(entries).toMatchObject([
      { status: 'denied', deviceId: 'lock.front_door' },
    ]);
  });
  it('writes pending audit before execution and finalizes success', async () => {
    const { tools, devices, entries } = setup();
    vi.mocked(devices.setLight).mockImplementation(async (operation) => {
      expect(entries).toMatchObject([{ status: 'pending' }]);
      return { id: operation.deviceId, name: 'Light', state: operation.state };
    });
    await tools.setLight('conversation', {
      deviceId: 'light.living_room',
      state: 'on',
    });
    expect(entries[0]?.status).toBe('succeeded');
  });
  it('does not execute if the audit cannot be written', async () => {
    const { tools, devices, audit } = setup();
    vi.spyOn(audit, 'record').mockImplementation(() => {
      throw new Error('Disk full');
    });
    await expect(
      tools.setLight('conversation', {
        deviceId: 'light.living_room',
        state: 'on',
      }),
    ).rejects.toThrow('Disk full');
    expect(devices.setLight).not.toHaveBeenCalled();
  });
  it('records device failures', async () => {
    const { tools, devices, entries } = setup();
    vi.mocked(devices.setLight).mockRejectedValue(new Error('Unavailable'));
    await expect(
      tools.setLight('conversation', {
        deviceId: 'light.living_room',
        state: 'on',
      }),
    ).rejects.toThrow('Unavailable');
    expect(entries[0]?.status).toBe('failed');
  });
});

describe('chat use case', () => {
  it('persists turns, streams chunks, and passes server history to the agent', async () => {
    const storage = memory();
    const stream = vi.fn<ChatAgent['stream']>(async function* () {
      yield 'Hello ';
      yield 'home.';
    });
    const service = new ChatService(storage.repository, { stream }, runtime);
    const first = await collect(service.stream({ message: 'Hello' }));
    const started = first[0];
    expect(started?.type).toBe('started');
    if (started?.type !== 'started') throw new Error('Expected started event');
    expect(first.at(-1)).toEqual({
      type: 'done',
      conversationId: started.conversationId,
      message: 'Hello home.',
    });
    await collect(
      service.stream({
        conversationId: started.conversationId,
        message: 'Again',
      }),
    );
    expect(stream.mock.calls[1]?.[0].history.map((item) => item.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(storage.messages).toHaveLength(4);
  });
  it('rejects empty input and unknown conversations', async () => {
    const { repository } = memory();
    const service = new ChatService(
      repository,
      {
        stream: async function* () {
          yield 'ok';
        },
      },
      runtime,
    );
    await expect(collect(service.stream({ message: ' ' }))).rejects.toThrow();
    await expect(
      collect(
        service.stream({ conversationId: randomUUID(), message: 'Hello' }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('keeps failed user turns but never persists partial assistant output', async () => {
    const { repository, messages } = memory();
    const service = new ChatService(
      repository,
      {
        stream: async function* () {
          yield 'Partial';
          throw new Error('Provider failed');
        },
      },
      runtime,
    );
    await expect(collect(service.stream({ message: 'Hello' }))).rejects.toThrow(
      'Provider failed',
    );
    expect(messages.map((item) => item.role)).toEqual(['user']);
  });
  it('serializes requests per conversation and releases the lock on cancellation', async () => {
    const { repository } = memory();
    const id = randomUUID();
    repository.create({ id, createdAt: runtime.now() });
    const service = new ChatService(
      repository,
      {
        stream: async function* () {
          yield 'ok';
        },
      },
      runtime,
    );
    const first = service.stream({ conversationId: id, message: 'First' });
    await first.next();
    await expect(
      collect(service.stream({ conversationId: id, message: 'Second' })),
    ).rejects.toMatchObject({ code: 'BUSY' });
    await first.return(undefined);
    await expect(
      collect(service.stream({ conversationId: id, message: 'Third' })),
    ).resolves.toMatchObject([
      { type: 'started' },
      { type: 'delta' },
      { type: 'done' },
    ]);
  });
});
