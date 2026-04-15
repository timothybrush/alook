-- Migration: add machine table for machine-level liveness tracking
-- agent_runtime loses status/last_seen_at conceptually (kept as dead columns in DB)

CREATE TABLE IF NOT EXISTS machine (
  daemon_id    TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  device_info  TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (workspace_id, daemon_id)
);

-- Backfill from agent_runtime: one machine row per (daemon_id, workspace_id)
INSERT OR IGNORE INTO machine (daemon_id, workspace_id, device_info, last_seen_at, created_at, updated_at)
SELECT
  daemon_id,
  workspace_id,
  COALESCE(MAX(device_info), ''),
  MAX(last_seen_at),
  MIN(created_at),
  MAX(updated_at)
FROM agent_runtime
WHERE daemon_id IS NOT NULL AND daemon_id != ''
GROUP BY daemon_id, workspace_id;
