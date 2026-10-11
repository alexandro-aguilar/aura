import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
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
  it('upgrades an existing v1 database without losing history, audit IDs or order', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aura-migration-'));
    const filename = join(directory, 'aura.sqlite');
    const conversationId = randomUUID();
    const auditId = randomUUID();
    const initial = new Database(filename);
    initial.exec(
      readFileSync(
        new URL('../migrations/0001_initial.sql', import.meta.url),
        'utf8',
      ),
    );
    initial.pragma('user_version = 1');
    initial
      .prepare('INSERT INTO conversations VALUES (?, ?)')
      .run(conversationId, '2026-10-10T00:00:00Z');
    initial
      .prepare(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        randomUUID(),
        conversationId,
        'user',
        'Existing turn',
        '2026-10-10T00:00:00Z',
      );
    initial
      .prepare(
        'INSERT INTO execution_audit (id, conversation_id, device_id, state, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        auditId,
        conversationId,
        'light.living_room',
        'on',
        'pending',
        '2026-10-10T00:00:00Z',
      );
    initial.close();
    const storage = openPersistence(filename);
    try {
      expect(storage.conversations.messages(conversationId)[0]?.content).toBe(
        'Existing turn',
      );
      expect(storage.audit.list(conversationId)).toMatchObject([
        { id: auditId, status: 'pending' },
      ]);
      storage.audit.finish(auditId, 'uncertain');
      const secondId = randomUUID();
      storage.audit.record({
        id: secondId,
        conversationId,
        deviceId: 'light.bedroom',
        state: 'off',
        status: 'succeeded',
        createdAt: '2026-10-10T00:00:00Z',
      });
      expect(
        storage.audit.list(conversationId).map((entry) => entry.id),
      ).toEqual([auditId, secondId]);
      const inspection = new Database(filename, { readonly: true });
      try {
        expect(inspection.pragma('user_version', { simple: true })).toBe(5);
        expect(inspection.pragma('foreign_key_check')).toEqual([]);
        expect(inspection.pragma('integrity_check')).toEqual([
          { integrity_check: 'ok' },
        ]);
      } finally {
        inspection.close();
      }
    } finally {
      storage.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

it.each([3, 4])(
  'migrates v%s preferences to the latest schema without changing provenance or automation state',
  (version) => {
    const directory = mkdtempSync(join(tmpdir(), 'aura-preference-upgrade-'));
    const filename = join(directory, 'aura.sqlite');
    const initial = new Database(filename);
    const id = randomUUID();
    for (const migration of [
      '0001_initial.sql',
      '0002_uncertain_audit.sql',
      '0003_preferences.sql',
      '0004_automations.sql',
    ].slice(0, version))
      initial.exec(
        readFileSync(
          new URL(`../migrations/${migration}`, import.meta.url),
          'utf8',
        ),
      );
    initial
      .prepare(
        'INSERT INTO approved_preferences (id, category, value, approved_at, source) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, 'response_language', 'es', '2026-10-10T00:00:00Z', 'operator');
    if (version === 4)
      initial.exec('UPDATE automation_control SET enabled = 1 WHERE id = 1');
    initial.pragma(`user_version = ${version}`);
    initial.close();
    const storage = openPersistence(filename);
    try {
      expect(storage.preferences.list()).toEqual([
        {
          id,
          category: 'response_language',
          value: 'es',
          approvedAt: '2026-10-10T00:00:00Z',
          source: 'operator',
          sourceConversationId: null,
        },
      ]);
      expect(storage.automations.enabled()).toBe(version === 4);
      expect(storage.preferences.enabled()).toBe(false);
    } finally {
      storage.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
