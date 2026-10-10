import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openPersistence } from './index.js';

describe('SQLite repositories', () => {
  it('migrates, persists history and audit across reopening, and preserves insertion order', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aura-'));
    const filename = join(directory, 'aura.sqlite');
    const id = randomUUID();
    const auditId = randomUUID();
    const createdAt = '2026-10-10T00:00:00Z';
    let storage = openPersistence(filename);
    try {
      storage.conversations.create({ id, createdAt });
      storage.conversations.append({
        id: randomUUID(),
        conversationId: id,
        role: 'user',
        content: 'Hello',
        createdAt,
      });
      storage.conversations.append({
        id: randomUUID(),
        conversationId: id,
        role: 'assistant',
        content: 'Hi',
        createdAt,
      });
      storage.audit.record({
        id: auditId,
        conversationId: id,
        deviceId: 'light.living_room',
        state: 'on',
        status: 'pending',
        createdAt,
      });
      storage.audit.finish(auditId, 'succeeded');
      storage.close();
      storage = openPersistence(filename);
      expect(
        storage.conversations.messages(id).map((message) => message.content),
      ).toEqual(['Hello', 'Hi']);
      expect(storage.audit.list(id)).toMatchObject([
        { id: auditId, status: 'succeeded' },
      ]);
      expect(() => storage.health()).not.toThrow();
    } finally {
      storage.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('enforces conversation foreign keys', () => {
    const storage = openPersistence(':memory:');
    try {
      expect(() =>
        storage.conversations.append({
          id: randomUUID(),
          conversationId: randomUUID(),
          role: 'user',
          content: 'orphan',
          createdAt: new Date().toISOString(),
        }),
      ).toThrow();
    } finally {
      storage.close();
    }
  });
});
