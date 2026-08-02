import { queries, withD1Retry } from "@alook/shared"
import { getDb } from "@/lib/db"
import { withAuth } from "@/lib/middleware/auth"
import { writeJSON, writeError } from "@/lib/middleware/helpers"
import { logAudit, COMMUNITY_AUDIT_ACTIONS } from "@/lib/community/audit"

/**
 * Deny a pending bot approval request. No side effects beyond flipping the
 * row to `denied` and writing an audit row. The requester is NOT notified —
 * they must observe the outcome indirectly (their earlier "Request sent"
 * remains, but no accept event ever arrives).
 */
export const POST = withAuth(async (_req, ctx) => {
  const botId = ctx.params?.id as string
  const requestId = ctx.params?.requestId as string
  const db = getDb(ctx.env.DB)

  // `withD1Retry` (D1-armor state 2): ownership door-read — a transient would
  // 404 the owner's own bot (mis-judged permission state); retry to truth.
  const bot = await withD1Retry(() => queries.communityBot.getBotOwnedBy(db, botId, ctx.userId), {
    route: "bots/approval-deny/ownership",
  })
  if (!bot) return writeError("bot not found", 404)

  // `withD1Retry` (D1-armor state 2): the approval-request read gates the deny
  // action — a transient would 404 a real pending request; retry to truth.
  const request = await withD1Retry(() => queries.communityBot.getApprovalRequest(db, requestId), {
    route: "bots/approval-deny/request",
  })
  if (!request || request.botId !== botId) {
    return writeError("approval request not found", 404)
  }
  // Only join_server rows survive migration 0065; anything else 404s defensively.
  if (request.kind !== "join_server") {
    return writeError("approval request not found", 404)
  }
  if (request.status !== "pending") {
    return writeError("request already resolved", 400)
  }

  // `withD1Retry` (D1-armor state 3): resolve-to-"denied" is a set-status write
  // guarded by the status!=="pending" check above — idempotent, safe to retry.
  await withD1Retry(() => queries.communityBot.resolveApprovalRequest(db, requestId, "denied"), {
    route: "bots/approval/deny",
  })

  logAudit(db, {
    serverId: request.serverId ?? null,
    actorId: ctx.userId,
    action: COMMUNITY_AUDIT_ACTIONS.BOT_JOIN_DENIED,
    targetType: "user",
    targetId: botId,
    changes: JSON.stringify({
      botId,
      requestedByUserId: request.requestedByUserId,
      serverId: request.serverId ?? undefined,
    }),
  })

  return writeJSON({ status: "denied", kind: request.kind })
})
