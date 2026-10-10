import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { asc, eq } from 'drizzle-orm';
import type {
  AuditEntry,
  AuditRepository,
  ConversationRepository,
} from '@aura/domain';
import { audit, conversations, messages } from './schema.js';

export interface Persistence {
  conversations: ConversationRepository;
  audit: AuditRepository;
  health(): void;
  close(): void;
}

export function openPersistence(filename: string): Persistence {
  if (filename !== ':memory:')
    mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  const version = sqlite.pragma('user_version', { simple: true });
  if (version === 0) {
    sqlite.transaction(() => {
      sqlite.exec(
        readFileSync(
          new URL('../migrations/0001_initial.sql', import.meta.url),
          'utf8',
        ),
      );
      sqlite.pragma('user_version = 1');
    })();
  } else if (version !== 1) {
    sqlite.close();
    throw new Error('Unsupported database schema version');
  }
  const db = drizzle(sqlite);
  const conversationRepository: ConversationRepository = {
    create: (conversation) => {
      db.insert(conversations).values(conversation).run();
    },
    exists: (id) =>
      db.select().from(conversations).where(eq(conversations.id, id)).get() !==
      undefined,
    messages: (id) =>
      db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, id))
        .orderBy(asc(messages.sequence))
        .all(),
    append: (message) => {
      db.insert(messages).values(message).run();
    },
  };
  const auditRepository: AuditRepository = {
    record: (entry) => {
      db.insert(audit).values(entry).run();
    },
    finish: (id: string, status: AuditEntry['status']) => {
      db.update(audit).set({ status }).where(eq(audit.id, id)).run();
    },
    list: (conversationId) =>
      db
        .select()
        .from(audit)
        .where(eq(audit.conversationId, conversationId))
        .orderBy(asc(audit.sequence))
        .all(),
  };
  return {
    conversations: conversationRepository,
    audit: auditRepository,
    health: () => {
      sqlite.prepare('SELECT 1').get();
    },
    close: () => {
      sqlite.close();
    },
  };
}
