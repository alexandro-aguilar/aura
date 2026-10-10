ALTER TABLE execution_audit RENAME TO execution_audit_v1;
CREATE TABLE execution_audit (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  device_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('on', 'off')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'denied', 'failed', 'uncertain')),
  created_at TEXT NOT NULL
);
INSERT INTO execution_audit (sequence, id, conversation_id, device_id, state, status, created_at)
  SELECT sequence, id, conversation_id, device_id, state, status, created_at FROM execution_audit_v1;
DROP TABLE execution_audit_v1;
CREATE INDEX audit_conversation ON execution_audit(conversation_id, sequence);
