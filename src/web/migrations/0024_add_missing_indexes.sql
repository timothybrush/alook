-- Add missing indexes on emails, taskMessage, and session tables

-- emails: composite index for status-based queries (inbox filtered by status)
CREATE INDEX IF NOT EXISTS idx_emails_agent_ws_status
  ON emails(agent_id, workspace_id, status);

-- emails: recipient + direction lookups
CREATE INDEX IF NOT EXISTS idx_emails_to_direction
  ON emails(to_email, direction);

-- emails: sender + direction lookups
CREATE INDEX IF NOT EXISTS idx_emails_from_direction
  ON emails(from_email, direction);

-- emails: message-id threading lookups
CREATE INDEX IF NOT EXISTS idx_emails_message_id
  ON emails(message_id);

-- emails: ordering by created_at
CREATE INDEX IF NOT EXISTS idx_emails_created_at
  ON emails(created_at);

-- task_message: stale detection by task + timestamp
CREATE INDEX IF NOT EXISTS idx_task_message_task_created
  ON task_message(task_id, created_at);

-- session: auth hot path covering index (token lookup with expiry filter)
CREATE INDEX IF NOT EXISTS idx_session_token_expires
  ON session(token, expiresAt);
