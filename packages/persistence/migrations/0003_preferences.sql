CREATE TABLE approved_preferences (
  id TEXT NOT NULL PRIMARY KEY,
  category TEXT NOT NULL UNIQUE CHECK(category IN ('response_language', 'response_style')),
  value TEXT NOT NULL CHECK((category = 'response_language' AND value IN ('en', 'es')) OR (category = 'response_style' AND value IN ('concise', 'detailed'))),
  approved_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source = 'operator'),
  source_conversation_id TEXT REFERENCES conversations(id)
);
