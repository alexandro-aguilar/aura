CREATE TABLE automation_rules (
  id TEXT NOT NULL PRIMARY KEY,
  document TEXT NOT NULL CHECK(json_valid(document))
);
CREATE TABLE automation_control (
  id INTEGER NOT NULL PRIMARY KEY CHECK(id = 1),
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1))
);
INSERT INTO automation_control (id, enabled) VALUES (1, 0);
CREATE TABLE automation_events (
  id TEXT NOT NULL PRIMARY KEY,
  observed_at_ms INTEGER NOT NULL
);
CREATE INDEX automation_events_time ON automation_events(observed_at_ms);
CREATE TABLE automation_runs (
  id TEXT NOT NULL PRIMARY KEY,
  rule_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  created_at_ms INTEGER NOT NULL,
  document TEXT NOT NULL CHECK(json_valid(document)),
  UNIQUE(rule_id, event_id)
);
CREATE INDEX automation_runs_time ON automation_runs(created_at_ms);
CREATE INDEX automation_runs_rule_time ON automation_runs(rule_id, created_at_ms);
