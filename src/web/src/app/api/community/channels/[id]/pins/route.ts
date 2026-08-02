import { NextRequest } from "next/server"
import { withAuth } from "@/lib/middleware/auth"
import { writeJSON, writeError } from "@/lib/middleware/helpers"
import { getDb } from "@/lib/db"
import { queries, withD1Retry, isUniqueConstraintError, WS_EVENTS } from "@alook/shared"
import { fanOutToChannel } from "@/lib/community/fanout"
import { requireChannelMember, requireServerAdmin } from "@/lib/community/permissions"
import { requirePinnableSurface } from "@/lib/community/channel-write-guard"
import { logAudit } from "@/lib/community/audit"
import { avatarInitial } from "@/lib/community/avatar"

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const channelId = ctx.params?.id
  if (!channelId) return writeError("missing channel id", 400)

  const db = getDb(ctx.env.DB)
  const auth = await requireChannelMember(db, channelId, ctx.userId)
  if (!auth.ok) return writeError(auth.error, auth.status)

  // `withD1Retry` (D1-armor state 2): no-fallback pin-list read — a transient
  // false-empty would render an empty pins list; retry to truth.
  const rows = await withD1Retry(() => queries.communityPin.listPins(db, channelId), {
    route: "channels/pins/list",
  })
  const pins = rows.map((r) => ({
    id: r.message.id,
    authorName: r.author.name,
    authorAvatar: r.author.image ?? avatarInitial(r.author.name),
    content: r.message.content,
    createdAt: r.message.createdAt,
  }))
  return writeJSON({ pins })
})

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const channelId = ctx.params?.id
  if (!channelId) return writeError("missing channel id", 400)

  const db = getDb(ctx.env.DB)

  // `withD1Retry` (D1-armor state 2): channel existence/type gate — a transient
  // would 404 a real channel; retry to truth.
  const channel = await withD1Retry(() => queries.communityChannel.getChannel(db, channelId), {
    route: "channels/pins/get-channel",
  })
  if (!channel) return writeError("channel not found", 404)

  const pinnable = requirePinnableSurface(channel.type)
  if (!pinnable.ok) return writeError(pinnable.error, pinnable.status)

  // Pinning is a moderation action — require server admin / owner.
  const adminCheck = await requireServerAdmin(db, channel.serverId, ctx.userId)
  if (!adminCheck.ok) return writeError(adminCheck.error, adminCheck.status)

  let body: { messageId: string }
  try {
    body = await req.json()
  } catch {
    return writeError("invalid request body", 400)
  }
  if (!body.messageId) return writeError("missing messageId", 400)

  // Ensure the target message belongs to this channel.
  // `withD1Retry` (D1-armor state 2): target-message scope check gates the pin —
  // a transient would 404 a real message; retry to truth.
  const target = await withD1Retry(() => queries.communityMessage.getMessage(db, body.messageId), {
    route: "channels/pins/target-message",
  })
  if (!target || target.channelId !== channelId) {
    return writeError("message not found", 404)
  }

  let pin
  try {
    // `withD1Retry` (D1-armor state 3): a pin is unique per (channel, message),
    // so a retry can't double-pin. Transient retries; the UNIQUE error isn't in
    // the whitelist → withD1Retry rethrows into the catch (already-pinned → 409).
    pin = await withD1Retry(
      () =>
        queries.communityPin.pinMessage(db, {
          channelId,
          messageId: body.messageId,
          pinnedBy: ctx.userId,
        }),
      { route: "channels/pins/pin" },
    )
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return writeError("message already pinned", 409)
    throw e
  }

  fanOutToChannel(channelId, {
    type: WS_EVENTS.PIN_ADD,
    channelId,
    messageId: body.messageId,
  }, { excludeUserId: ctx.userId })

  logAudit(db, {
    serverId: channel.serverId,
    actorId: ctx.userId,
    action: "pin_add",
    targetType: "message",
    targetId: body.messageId,
  })

  return writeJSON(pin, 201)
})
