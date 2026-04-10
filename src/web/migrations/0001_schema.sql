-- Better Auth managed tables (camelCase columns as expected by Better Auth)
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  idToken TEXT,
  password TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Runtimes
CREATE TABLE IF NOT EXISTS runtimes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  hostname TEXT NOT NULL,
  detected_runtimes TEXT NOT NULL DEFAULT '[]',
  last_heartbeat_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  runtime_id TEXT NOT NULL REFERENCES runtimes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  email_handle TEXT NOT NULL UNIQUE,
  agent_type TEXT NOT NULL,
  model TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  forward_to_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Whitelist
CREATE TABLE IF NOT EXISTS agent_whitelist (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, email)
);

-- Emails
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  r2_key TEXT NOT NULL,
  is_whitelisted INTEGER NOT NULL DEFAULT 0,
  forwarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Events (CLI inbox)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content_raw TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent tasks
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  output_raw TEXT,
  started_at TEXT,
  finished_at TEXT
);

-- Indexes (Better Auth)
CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session"(userId);
CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token);
CREATE INDEX IF NOT EXISTS idx_account_user_id ON "account"(userId);

-- Indexes (App)
CREATE INDEX IF NOT EXISTS idx_runtimes_user_id ON runtimes(user_id);
CREATE INDEX IF NOT EXISTS idx_runtimes_token ON runtimes(token);
CREATE INDEX IF NOT EXISTS idx_agents_runtime_id ON agents(runtime_id);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_consumed ON events(consumed_at);
CREATE INDEX IF NOT EXISTS idx_emails_agent_id ON emails(agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_agent_id ON chat_messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON agent_tasks(agent_id);
