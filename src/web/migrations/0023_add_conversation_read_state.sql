CREATE TABLE IF NOT EXISTS conversation_read_state (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_read_state_user
  ON conversation_read_state(user_id);

-- Performance indexes for inbox queries
CREATE INDEX IF NOT EXISTS idx_message_conv_role_status_created
  ON message(conversation_id, role, status, created_at);

CREATE INDEX IF NOT EXISTS idx_conversation_user_workspace
  ON conversation(user_id, workspace_id);
