import { NextRequest } from "next/server"
import { withAuth } from "@/lib/middleware/auth"
import { writeJSON, writeError } from "@/lib/middleware/helpers"
import { getDb } from "@/lib/db"
import { queries, withD1Retry } from "@alook/shared"
import { requireChannelMember } from "@/lib/community/permissions"
import { requireChildSurface } from "@/lib/community/channel-write-guard"

/**
 * PUT /api/community/threads/:id/read
 *
 * Same two-shape contract as `PUT /channels/:id/read` (a thread is a channel):
 * - Body `{ lastReadMessageId }` present → scope-check + align to that
 *   message.
 * - Body absent / empty → align to the thread's latest message. Empty thread
 *   → no-op (invariant forbids `lastReadMessageId = null` rows).
 */
export const PUT = withAuth(async (req: NextRequest, ctx) => {
  const channelId = ctx.params?.id
  if (!channelId) return writeError("missing id", 400)

  const db = getDb(ctx.env.DB)

  // Two-step check preserves the 404-vs-403 contract that sibling channel
  // routes (pins, threads, PATCH/DELETE) also honor: unknown channel → 404,
  // known channel + non-member → 403. `requireChannelMember` alone collapses
  // both into 403 because the JOIN can't tell the difference.
  // `withD1Retry` (D1-armor state 2): existence/access read — a transient would
  // 404 a real thread channel (mis-judged state); retry to truth.
  const channel = await withD1Retry(() => queries.communityChannel.getChannel(db, channelId), {
    route: "threads/read/get-channel",
  })
  if (!channel) return writeError("channel not found", 404)
  const child = requireChildSurface(channel.type)
  if (!child.ok) return writeError(child.error, child.status)
  const auth = await requireChannelMember(db, channelId, ctx.userId)
  if (!auth.ok) return writeError(auth.error, auth.status)

  let body: { lastReadMessageId?: string } = {}
  try {
    body = await req.json()
  } catch {
    // Body is optional
  }

  let target: { id: string; createdAt: string; seq: number } | null
  if (body.lastReadMessageId) {
    // `withD1Retry` (D1-armor state 2): target anchors the thread read watermark
    // — a transient would 404 a real message (wrong 404 + no advance); retry.
    const msg = await withD1Retry(() => queries.communityMessage.getMessage(db, body.lastReadMessageId!), {
      route: "threads/read/target-message",
    })
    if (!msg) return writeError("message not found", 404)
    if (msg.channelId !== channelId) {
      return writeError("message not in channel", 400)
    }
    target = { id: msg.id, createdAt: msg.createdAt, seq: msg.seq }
  } else {
    // `withD1Retry` (D1-armor state 2): mass mark-read resolves to latest — a
    // transient false-empty would wrongly no-op a real mark-read; retry to truth.
    target = await withD1Retry(() => queries.communityMessage.getLatestMessage(db, { channelId }), {
      route: "threads/read/latest-message",
    })
    if (!target) return writeJSON({ ok: true })
  }

  // A thread IS a channel — mirror the channel read route: advance the read
  // watermark AND clear the thread's own mentions in one D1 batch (keyed on the
  // thread's channelId). Without the mention clear, opening a thread wouldn't
  // dismiss its mentions (plan gap #4).
  // `withD1Retry` (D1-armor state 3): the mark-read + mention-clear batch is
  // idempotent (set watermark + clear), safe to re-run — wrapped as ONE unit so
  // the atomic batch retries whole (thread twin of the channels/[id]/read
  // read-500 fix; this was the bare sibling flagged in the swallow-class audit).
  await withD1Retry(
    () =>
      db.batch([
        queries.communityReadState.markReadToMessageBuilder(db, {
          userId: ctx.userId,
          channelId,
          message: target,
        }),
        queries.communityMention.markChannelMentionsReadBuilder(db, ctx.userId, channelId),
      ]),
    { route: "threads/read" },
  )

  return writeJSON({ ok: true })
})
