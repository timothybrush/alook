import { NextResponse } from "next/server"
import { queries, withD1Retry, WS_EVENTS } from "@alook/shared"
import { getDb } from "@/lib/db"
import { withAuth } from "@/lib/middleware/auth"
import { writeError } from "@/lib/middleware/helpers"
import { broadcastToUserSafe } from "@/lib/community/fanout"
import { logAudit, COMMUNITY_AUDIT_ACTIONS } from "@/lib/community/audit"

export const DELETE = withAuth(async (_req, ctx) => {
  const db = getDb(ctx.env.DB)
  const id = ctx.params?.id as string

  // Hardening — see plans/agent-friendship-approval-gate.md §Hardening.
  if (ctx.user?.isBot) return writeError("forbidden", 403)

  if (!id) {
    return writeError("friendship id is required", 400)
  }

  // `withD1Retry` (D1-armor state 2): friendship access-gate read — a transient
  // would 404 a real friendship; retry to truth.
  const friendship = await withD1Retry(() => queries.communityFriendship.getFriendship(db, id), {
    route: "friends/remove/friendship",
  })
  if (!friendship) {
    return writeError("friendship not found", 404)
  }

  const isParticipant =
    friendship.requesterId === ctx.userId || friendship.addresseeId === ctx.userId

  if (friendship.status === "accepted") {
    // (a) Either party may remove an accepted friendship.
    if (!isParticipant) {
      return writeError("not a participant in this friendship", 403)
    }
  } else if (friendship.status === "pending") {
    // (b) The requester cancels their own pending. (c) The bot's owner cancels
    // a pending row their bot created. Target-owner deny is NOT here — that path
    // is owner-decision with decision='deny' (one path per role).
    let allowed = friendship.requesterId === ctx.userId
    if (!allowed) {
      // `withD1Retry` (D1-armor state 2): resolves the bot-owner cancel path — a
      // transient would wrongly deny a legit owner cancel; retry to truth.
      const requester = await withD1Retry(() => queries.user.getUserInternal(db, friendship.requesterId), {
        route: "friends/remove/requester",
      })
      if (requester?.isBot && requester.ownerUserId === ctx.userId) allowed = true
    }
    if (!allowed) {
      return writeError("not allowed to cancel this request", 403)
    }
  } else {
    return writeError("friendship is not active", 400)
  }

  // Gated-pending withdrawal: a gating owner is holding an actionable
  // Approve/Deny card. Soft-cancel the row and rehydrate that card to a
  // non-actionable "cancelled" chip — a hard delete would leave the card
  // pointing at a deleted row (clicks 409, card lingers until refetch).
  if (friendship.status === "pending" && friendship.needsOwnerApproval != null) {
    // `withD1Retry` (state 3): cancelPendingRequest is `UPDATE ... WHERE
    // status='pending'` → a retry affects 0 rows (already cancelled), idempotent.
    const { row, broadcasts } = await withD1Retry(
      () => queries.communityFriendship.cancelPendingRequest(db, id),
      { route: "friends/cancel" },
    )
    if (row) {
      for (const b of broadcasts) broadcastToUserSafe(b.userId, b.event)
      logAudit(db, {
        serverId: null,
        actorId: ctx.userId,
        action: COMMUNITY_AUDIT_ACTIONS.BOT_FRIEND_CANCELLED,
        targetType: "friendship",
        targetId: id,
      })
    }
    return new NextResponse(null, { status: 204 })
  }

  // `withD1Retry` (state 3): removeFriend is delete-by-key, idempotent.
  await withD1Retry(() => queries.communityFriendship.removeFriend(db, id), {
    route: "friends/remove",
  })

  const otherUserId = friendship.requesterId === ctx.userId
    ? friendship.addresseeId
    : friendship.requesterId

  broadcastToUserSafe(otherUserId, {
    type: WS_EVENTS.FRIEND_REMOVE,
    friendshipId: id,
  })

  return new NextResponse(null, { status: 204 })
})
