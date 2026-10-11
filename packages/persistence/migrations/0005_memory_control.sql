CREATE TABLE memory_control (
  id INTEGER NOT NULL PRIMARY KEY CHECK(id = 1),
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1))
);
INSERT INTO memory_control (id, enabled) VALUES (1, 0);
