-- Composite index for conversation agent lookups (getOrCreateAgentConversation, listPreviousConversations)
CREATE INDEX IF NOT EXISTS idx_conversation_agent_lookup
  ON conversation (workspace_id, agent_id, user_id, type, channel, created_at);

-- Index for active task lookup by conversation (getActiveTaskByConversation)
CREATE INDEX IF NOT EXISTS idx_task_queue_conversation_status
  ON agent_task_queue (conversation_id, status);
