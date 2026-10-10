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
