import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { asc, desc, eq, and, gte, lt, count } from 'drizzle-orm';
import type {
  AuditEntry,
  AuditRepository,
  ConversationRepository,
  PreferenceRepository,
  AutomationRepository,
} from '@aura/domain';
import {
  audit,
  conversations,
  messages,
  preferences,
  memoryControl,
  automationRules,
  automationControl,
  automationEvents,
  automationRuns,
} from './schema.js';

export interface Persistence {
  conversations: ConversationRepository;
  audit: AuditRepository;
  preferences: PreferenceRepository;
  automations: AutomationRepository;
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
  const migrations = [
    '0001_initial.sql',
    '0002_uncertain_audit.sql',
    '0003_preferences.sql',
    '0004_automations.sql',
    '0005_memory_control.sql',
  ];
  try {
    if (
      typeof version !== 'number' ||
      !Number.isInteger(version) ||
      version < 0 ||
      version > migrations.length
    )
      throw new Error('Unsupported database schema version');
    for (let index = version; index < migrations.length; index++) {
      sqlite.transaction(() => {
        sqlite.exec(
          readFileSync(
            new URL(`../migrations/${migrations[index]}`, import.meta.url),
            'utf8',
          ),
        );
        sqlite.pragma(`user_version = ${index + 1}`);
      })();
    }
  } catch (error) {
    sqlite.close();
    throw error;
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
  const automationRepository: AutomationRepository = {
    list: () =>
      db
        .select()
        .from(automationRules)
        .orderBy(asc(automationRules.id))
        .all()
        .map((row) => row.document),
    create: (rule) => {
      db.insert(automationRules).values({ id: rule.id, document: rule }).run();
    },
    activate: (id, enabled) => {
      const row = db
        .select()
        .from(automationRules)
        .where(eq(automationRules.id, id))
        .get();
      if (!row) return false;
      db.update(automationRules)
        .set({ document: { ...row.document, enabled } })
        .where(eq(automationRules.id, id))
        .run();
      return true;
    },
    delete: (id) =>
      db.delete(automationRules).where(eq(automationRules.id, id)).run()
        .changes > 0,
    enabled: () => db.select().from(automationControl).get()?.enabled ?? false,
    setEnabled: (enabled) => {
      db.update(automationControl)
        .set({ enabled })
        .where(eq(automationControl.id, 1))
        .run();
    },
    beginEvent: (event, now) =>
      sqlite.transaction(() => {
        // Retained IDs cover seven days; older events are already rejected by the 10-second freshness gate.
        db.delete(automationEvents)
          .where(
            lt(automationEvents.observedAtMs, Date.parse(now) - 7 * 86400000),
          )
          .run();
        return (
          db
            .insert(automationEvents)
            .values({
              id: event.id,
              observedAtMs: Date.parse(event.observedAt),
            })
            .onConflictDoNothing()
            .run().changes > 0
        );
      })(),
    claim: (rule, event, runId, conversationId, now) =>
      sqlite.transaction(() => {
        const current = db
          .select()
          .from(automationRules)
          .where(eq(automationRules.id, rule.id))
          .get()?.document;
        if (
          !automationRepository.enabled() ||
          !current?.enabled ||
          JSON.stringify(current) !== JSON.stringify(rule)
        )
          return undefined;
        const nowMs = Date.parse(now);
        const global =
          db
            .select({ count: count() })
            .from(automationRuns)
            .where(gte(automationRuns.createdAtMs, nowMs - 60000))
            .get()?.count ?? 0;
        const recent =
          db
            .select({ count: count() })
            .from(automationRuns)
            .where(
              and(
                eq(automationRuns.ruleId, rule.id),
                gte(
                  automationRuns.createdAtMs,
                  nowMs - rule.cooldownSeconds * 1000,
                ),
              ),
            )
            .get()?.count ?? 0;
        if (global >= 4 || recent > 0) return undefined;
        const duplicate = db
          .select()
          .from(automationRuns)
          .where(
            and(
              eq(automationRuns.ruleId, rule.id),
              eq(automationRuns.eventId, event.id),
            ),
          )
          .get();
        if (duplicate) return undefined;
        const run = {
          id: runId,
          rule,
          event,
          conversationId,
          operationId: null,
          status: 'pending' as const,
          createdAt: now,
        };
        db.insert(conversations)
          .values({ id: conversationId, createdAt: now })
          .run();
        db.insert(automationRuns)
          .values({
            id: runId,
            ruleId: rule.id,
            eventId: event.id,
            conversationId,
            createdAtMs: nowMs,
            document: run,
          })
          .run();
        return run;
      })(),
    finish: (run) => {
      db.update(automationRuns)
        .set({ document: run })
        .where(eq(automationRuns.id, run.id))
        .run();
    },
    runs: () =>
      db
        .select()
        .from(automationRuns)
        .orderBy(desc(automationRuns.createdAtMs), desc(automationRuns.id))
        .limit(50)
        .all()
        .map((row) => row.document),
  };
  return {
    conversations: conversationRepository,
    audit: auditRepository,
    automations: automationRepository,
    preferences: {
      enabled: () =>
        db.select().from(memoryControl).where(eq(memoryControl.id, 1)).get()
          ?.enabled === true,
      setEnabled: (enabled) => {
        db.update(memoryControl)
          .set({ enabled })
          .where(eq(memoryControl.id, 1))
          .run();
      },
      list: () =>
        db.select().from(preferences).orderBy(asc(preferences.category)).all(),
      save: (preference) => {
        db.insert(preferences)
          .values(preference)
          .onConflictDoUpdate({ target: preferences.category, set: preference })
          .run();
      },
      delete: (id) =>
        db.delete(preferences).where(eq(preferences.id, id)).run().changes > 0,
    },
    health: () => {
      sqlite.prepare('SELECT 1').get();
    },
    close: () => {
      sqlite.close();
    },
  };
}
