import { queries, withD1Retry, ROLES, WS_EVENTS } from "@alook/shared"
import type { CommunityMemberJoin } from "@alook/shared"
import { getDb } from "@/lib/db"
import { withAuth } from "@/lib/middleware/auth"
import { writeJSON, writeError } from "@/lib/middleware/helpers"
import { fanOutToServerMembers } from "@/lib/community/fanout"
import { logAudit, COMMUNITY_AUDIT_ACTIONS } from "@/lib/community/audit"

/**
 * Approve a pending bot approval request. After migration 0065 only the
 * "join_server" kind survives (friend requests moved to community_friendship /
 * the owner-decision route). A row of any other kind 404s — such rows were
 * removed by the migration; this is a defensive path.
 */
export const POST = withAuth(async (_req, ctx) => {
  const botId = ctx.params?.id as string
  const requestId = ctx.params?.requestId as string
  const db = getDb(ctx.env.DB)

  // `withD1Retry` (D1-armor state 2): ownership door-read — a transient would
  // 404 the owner's own bot (mis-judged permission state); retry to truth.
  const bot = await withD1Retry(() => queries.communityBot.getBotOwnedBy(db, botId, ctx.userId), {
    route: "bots/approval-approve/ownership",
  })
  if (!bot) return writeError("bot not found", 404)

  // `withD1Retry` (D1-armor state 2): the approval-request read gates the
  // approve action — a transient would 404 a real pending request; retry to truth.
  const request = await withD1Retry(() => queries.communityBot.getApprovalRequest(db, requestId), {
    route: "bots/approval-approve/request",
  })
  if (!request || request.botId !== botId) {
    return writeError("approval request not found", 404)
  }
  if (request.kind !== "join_server") {
    return writeError("approval request not found", 404)
  }
  if (request.status !== "pending") {
    return writeError("request already resolved", 400)
  }

  if (!request.serverId) return writeError("malformed request", 400)
  // `withD1Retry` (D1-armor state 2): membership pre-check — a transient would
  // misjudge whether the bot is already a member; retry to truth.
  const alreadyMember = await withD1Retry(
    () => queries.communityMember.getMember(db, request.serverId!, botId),
    { route: "bots/approval-approve/already-member" },
  )
  if (!alreadyMember) {
    // `withD1Retry` (state 3): addMember is replay-safe here — the alreadyMember
    // check-then-insert plus the uq_server_member_server_user unique index mean
    // a retry either finds the row already added or hits the (non-retryable)
    // unique constraint; it can't double-insert.
    const added = await withD1Retry(
      () =>
        queries.communityMember.addMember(db, {
          serverId: request.serverId!,
          userId: botId,
          role: ROLES.MEMBER,
        }),
      { route: "bots/approve/add-member" },
    )
    const joinEvent: CommunityMemberJoin = {
      type: WS_EVENTS.MEMBER_JOIN,
      serverId: request.serverId,
      member: {
        id: added.id,
        userId: botId,
        name: bot.name,
        discriminator: bot.discriminator,
        avatar: bot.image ?? undefined,
        role: added.role ?? ROLES.MEMBER,
        joinedAt: added.joinedAt,
      },
    }
    fanOutToServerMembers(request.serverId, joinEvent)
  }
  // `withD1Retry` (state 3): resolve-to-"approved" is a set-status write guarded
  // by the status!=="pending" check above — idempotent, safe to retry.
  await withD1Retry(() => queries.communityBot.resolveApprovalRequest(db, requestId, "approved"), {
    route: "bots/approve/resolve",
  })
  logAudit(db, {
    serverId: request.serverId,
    actorId: ctx.userId,
    action: COMMUNITY_AUDIT_ACTIONS.BOT_JOIN_APPROVED,
    targetType: "user",
    targetId: botId,
    changes: JSON.stringify({ botId, serverId: request.serverId }),
  })
  logAudit(db, {
    serverId: request.serverId,
    actorId: ctx.userId,
    action: COMMUNITY_AUDIT_ACTIONS.BOT_ADDED_TO_SERVER,
    targetType: "user",
    targetId: botId,
    changes: JSON.stringify({
      botId,
      serverId: request.serverId,
      kind: "friend_of_bot_added",
    }),
  })
  return writeJSON({ status: "approved", kind: "join_server" })
})
