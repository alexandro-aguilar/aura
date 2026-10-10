CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE messages (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX messages_conversation ON messages(conversation_id, sequence);
CREATE TABLE execution_audit (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  device_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('on', 'off')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'denied', 'failed')),
  created_at TEXT NOT NULL
);
CREATE INDEX audit_conversation ON execution_audit(conversation_id, sequence);
