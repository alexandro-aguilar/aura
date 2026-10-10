import type { AutomationRule, AutomationRun } from '@aura/domain';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
});
export const messages = sqliteTable('messages', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});
export const audit = sqliteTable('execution_audit', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  deviceId: text('device_id').notNull(),
  state: text('state', { enum: ['on', 'off'] }).notNull(),
  status: text('status', {
    enum: ['pending', 'succeeded', 'denied', 'failed', 'uncertain'],
  }).notNull(),
  createdAt: text('created_at').notNull(),
});

export const preferences = sqliteTable('approved_preferences', {
  id: text('id').primaryKey(),
  category: text('category', { enum: ['response_language', 'response_style'] })
    .notNull()
    .unique(),
  value: text('value').notNull(),
  approvedAt: text('approved_at').notNull(),
  source: text('source', { enum: ['operator'] }).notNull(),
  sourceConversationId: text('source_conversation_id').references(
    () => conversations.id,
  ),
});

export const automationRules = sqliteTable('automation_rules', {
  id: text('id').primaryKey(),
  document: text('document', { mode: 'json' })
    .$type<AutomationRule>()
    .notNull(),
});
export const automationControl = sqliteTable('automation_control', {
  id: integer('id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
});
export const automationEvents = sqliteTable('automation_events', {
  id: text('id').primaryKey(),
  observedAtMs: integer('observed_at_ms').notNull(),
});
export const automationRuns = sqliteTable('automation_runs', {
  id: text('id').primaryKey(),
  ruleId: text('rule_id').notNull(),
  eventId: text('event_id').notNull(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  createdAtMs: integer('created_at_ms').notNull(),
  document: text('document', { mode: 'json' }).$type<AutomationRun>().notNull(),
});
