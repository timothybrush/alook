import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Database } from "../index";

export async function listUnreadConversations(
  db: Database,
  userId: string,
  workspaceId: string,
  opts?: { limit?: number; before?: string }
) {
  const limit = opts?.limit ?? 30;
  const beforeClause = opts?.before
    ? sql`AND m_latest.created_at < ${opts.before}`
    : sql``;

  const rows = await db.all<{
    id: string;
    agent_id: string;
    title: string;
    channel: string;
    latest_response: string;
    latest_response_at: string;
    root_prompt: string | null;
    agent_name: string | null;
    agent_avatar_url: string | null;
    root_task_status: string | null;
  }>(sql`
    WITH root_tasks AS (
      SELECT t.conversation_id, t.prompt, t.status, t.created_at,
             ROW_NUMBER() OVER (PARTITION BY t.conversation_id ORDER BY t.created_at DESC) AS rn
      FROM agent_task_queue t
      WHERE t.parent_task_id IS NULL
        AND t.trace_id IS NOT NULL
        AND t.type != 'kill_task'
        AND t.status IN ('completed', 'failed')
    )
    SELECT c.id,
           c.agent_id,
           c.title,
           c.channel,
           m_latest.content AS latest_response,
           m_latest.created_at AS latest_response_at,
           rt.prompt AS root_prompt,
           a.name AS agent_name,
           a.avatar_url AS agent_avatar_url,
           rt.status AS root_task_status
    FROM conversation c
    INNER JOIN message m_latest
      ON m_latest.conversation_id = c.id
      AND m_latest.role = 'assistant'
      AND m_latest.status = 'active'
      AND m_latest.id = (
        SELECT id FROM message
        WHERE conversation_id = c.id
          AND role = 'assistant'
          AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      )
    INNER JOIN root_tasks rt
      ON rt.conversation_id = c.id AND rt.rn = 1
    LEFT JOIN conversation_read_state crs
      ON crs.conversation_id = c.id AND crs.user_id = ${userId}
    LEFT JOIN agent a
      ON a.id = c.agent_id AND a.workspace_id = c.workspace_id
    WHERE c.user_id = ${userId}
      AND c.workspace_id = ${workspaceId}
      AND m_latest.created_at > COALESCE(crs.last_read_at, '1970-01-01T00:00:00.000Z')
      ${beforeClause}
    ORDER BY m_latest.created_at DESC
    LIMIT ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);

  return { items, hasMore };
}

export async function getUnreadCount(
  db: Database,
  userId: string,
  workspaceId: string,
) {
  const rows = await db.all<{ count: number }>(sql`
    SELECT COUNT(*) AS count
    FROM conversation c
    WHERE c.user_id = ${userId}
      AND c.workspace_id = ${workspaceId}
      AND EXISTS (
        SELECT 1 FROM agent_task_queue t
        WHERE t.conversation_id = c.id
          AND t.parent_task_id IS NULL
          AND t.trace_id IS NOT NULL
          AND t.type != 'kill_task'
          AND t.status IN ('completed', 'failed')
      )
      AND EXISTS (
        SELECT 1 FROM message m
        WHERE m.conversation_id = c.id
          AND m.role = 'assistant'
          AND m.status = 'active'
          AND m.created_at > COALESCE(
            (SELECT last_read_at FROM conversation_read_state
             WHERE conversation_id = c.id AND user_id = ${userId}),
            '1970-01-01T00:00:00.000Z'
          )
      )
  `);

  return rows[0]?.count ?? 0;
}

export async function markConversationRead(
  db: Database,
  userId: string,
  conversationId: string,
) {
  const now = new Date().toISOString();
  await db.run(sql`
    INSERT INTO conversation_read_state (id, conversation_id, user_id, last_read_at, created_at)
    VALUES (${nanoid()}, ${conversationId}, ${userId}, ${now}, ${now})
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET last_read_at = ${now}
  `);
}

export async function markAllConversationsRead(
  db: Database,
  userId: string,
  workspaceId: string,
) {
  const now = new Date().toISOString();
  await db.run(sql`
    INSERT INTO conversation_read_state (id, conversation_id, user_id, last_read_at, created_at)
    SELECT lower(hex(randomblob(11))), c.id, ${userId}, ${now}, ${now}
    FROM conversation c
    WHERE c.user_id = ${userId}
      AND c.workspace_id = ${workspaceId}
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET last_read_at = ${now}
  `);
}
