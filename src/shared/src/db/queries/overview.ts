import { eq, and, count, desc, inArray, gte, ne, lt, sql } from "drizzle-orm";
import { emails, agentEmailAccount, agentTaskQueue, conversation } from "../schema";
import type { Database } from "../index";
import { TASK_TYPES } from "../../constants";

export async function getEmailStatsByWorkspace(db: Database, workspaceId: string) {
  const rows = await db
    .select({
      direction: emails.direction,
      cnt: count(),
    })
    .from(emails)
    .where(eq(emails.workspaceId, workspaceId))
    .groupBy(emails.direction);

  const unreadRows = await db
    .select({ cnt: count() })
    .from(emails)
    .where(
      and(
        eq(emails.workspaceId, workspaceId),
        eq(emails.status, "unread"),
        eq(emails.direction, "inbound")
      )
    );

  const rejectedRows = await db
    .select({ cnt: count() })
    .from(emails)
    .where(
      and(
        eq(emails.workspaceId, workspaceId),
        eq(emails.isWhitelisted, false),
        eq(emails.direction, "inbound")
      )
    );

  let inbound = 0;
  let outbound = 0;
  for (const r of rows) {
    if (r.direction === "inbound") inbound = Number(r.cnt);
    if (r.direction === "outbound") outbound = Number(r.cnt);
  }

  return {
    inbound,
    outbound,
    unread: Number(unreadRows[0]?.cnt ?? 0),
    rejected: Number(rejectedRows[0]?.cnt ?? 0),
  };
}

export async function getEmailAccountsByWorkspace(db: Database, workspaceId: string) {
  return db
    .select({
      id: agentEmailAccount.id,
      agentId: agentEmailAccount.agentId,
      emailAddress: agentEmailAccount.emailAddress,
      status: agentEmailAccount.status,
      errorMessage: agentEmailAccount.errorMessage,
      lastSyncedAt: agentEmailAccount.lastSyncedAt,
    })
    .from(agentEmailAccount)
    .where(eq(agentEmailAccount.workspaceId, workspaceId));
}

export async function getTaskStatsByWorkspace(
  db: Database,
  workspaceId: string,
  todayStart: string
) {
  const terminalRows = await db
    .select({
      status: agentTaskQueue.status,
      cnt: count(),
    })
    .from(agentTaskQueue)
    .where(
      and(
        eq(agentTaskQueue.workspaceId, workspaceId),
        ne(agentTaskQueue.type, TASK_TYPES.KILL_TASK),
        gte(agentTaskQueue.completedAt, todayStart),
        inArray(agentTaskQueue.status, ["completed", "failed", "cancelled"])
      )
    )
    .groupBy(agentTaskQueue.status);

  const queuedRows = await db
    .select({ cnt: count() })
    .from(agentTaskQueue)
    .where(
      and(
        eq(agentTaskQueue.workspaceId, workspaceId),
        eq(agentTaskQueue.status, "queued"),
        ne(agentTaskQueue.type, TASK_TYPES.KILL_TASK)
      )
    );

  const staleThreshold = new Date(Date.now() - 3600 * 1000).toISOString();
  const staleRows = await db
    .select({ cnt: count() })
    .from(agentTaskQueue)
    .where(
      and(
        eq(agentTaskQueue.workspaceId, workspaceId),
        eq(agentTaskQueue.status, "running"),
        lt(agentTaskQueue.startedAt, staleThreshold)
      )
    );

  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  for (const r of terminalRows) {
    if (r.status === "completed") completed = Number(r.cnt);
    if (r.status === "failed") failed = Number(r.cnt);
    if (r.status === "cancelled") cancelled = Number(r.cnt);
  }

  return {
    completed,
    failed,
    cancelled,
    queued: Number(queuedRows[0]?.cnt ?? 0),
    stale: Number(staleRows[0]?.cnt ?? 0),
  };
}

export async function getRecentTerminalTasks(
  db: Database,
  workspaceId: string,
  visibleAgentIds: string[],
  limit = 15
) {
  if (visibleAgentIds.length === 0) return [];
  return db
    .select({
      id: agentTaskQueue.id,
      agentId: agentTaskQueue.agentId,
      type: agentTaskQueue.type,
      status: agentTaskQueue.status,
      prompt: agentTaskQueue.prompt,
      createdAt: agentTaskQueue.createdAt,
      completedAt: agentTaskQueue.completedAt,
      error: agentTaskQueue.error,
    })
    .from(agentTaskQueue)
    .where(
      and(
        eq(agentTaskQueue.workspaceId, workspaceId),
        inArray(agentTaskQueue.agentId, visibleAgentIds),
        ne(agentTaskQueue.type, TASK_TYPES.KILL_TASK),
        inArray(agentTaskQueue.status, ["completed", "failed", "cancelled"])
      )
    )
    .orderBy(desc(agentTaskQueue.completedAt))
    .limit(limit);
}

export async function getConversationCountsByAgent(db: Database, workspaceId: string, visibleAgentIds: string[]) {
  if (visibleAgentIds.length === 0) return [];
  return db
    .select({
      agentId: conversation.agentId,
      cnt: count(),
    })
    .from(conversation)
    .where(
      and(
        eq(conversation.workspaceId, workspaceId),
        inArray(conversation.agentId, visibleAgentIds)
      )
    )
    .groupBy(conversation.agentId);
}
