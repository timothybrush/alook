import { NextRequest } from "next/server"
import { withAuth } from "@/lib/middleware/auth"
import { writeJSON, writeError } from "@/lib/middleware/helpers"
import { getDb } from "@/lib/db"
import { queries, withD1Retry } from "@alook/shared"
import { requireDMAccess } from "@/lib/community/permissions"

/**
 * PUT /api/community/dm/:id/read
 *
 * DM twin of `PUT /channels/:id/read`.
 * - Body `{ lastReadMessageId }` present → verify the message lives in this
 *   DM, then align to it.
 * - Body absent / empty → align to the DM's latest message. Empty DM →
 *   no-op (invariant forbids `lastReadMessageId = null` rows).
 */
export const PUT = withAuth(async (req: NextRequest, ctx) => {
  const dmId = ctx.params?.id
  if (!dmId) return writeError("missing dm id", 400)

  const db = getDb(ctx.env.DB)
  const auth = await requireDMAccess(db, dmId, ctx.userId)
  if (!auth.ok) return writeError(auth.error, auth.status)

  let body: { lastReadMessageId?: string } = {}
  try {
    body = await req.json()
  } catch {
    // Body is optional
  }

  let target: { id: string; createdAt: string; seq: number } | null
  if (body.lastReadMessageId) {
    // `withD1Retry` (D1-armor state 2): target anchors the DM read watermark — a
    // transient would 400 a real message (wrong reject + no advance); retry.
    const msg = await withD1Retry(() => queries.communityMessage.getMessage(db, body.lastReadMessageId!), {
      route: "dm/read/target-message",
    })
    if (!msg || msg.channelId !== dmId) {
      return writeError("lastReadMessageId does not belong to this dm", 400)
    }
    target = { id: msg.id, createdAt: msg.createdAt, seq: msg.seq }
  } else {
    // `withD1Retry` (D1-armor state 2): mass mark-read resolves to latest — a
    // transient false-empty would wrongly no-op a real mark-read; retry to truth.
    target = await withD1Retry(() => queries.communityMessage.getLatestMessage(db, { channelId: dmId }), {
      route: "dm/read/latest-message",
    })
    if (!target) return writeJSON({ ok: true })
  }

  // `withD1Retry` (D1-armor state 3, idempotent write): mark-read sets the
  // watermark to a message, safe to re-run, so a transient retries not 500s
  // (DM twin of the channels/[id]/read fix, PR read-500 #2).
  await withD1Retry(
    () =>
      queries.communityReadState.markReadToMessage(db, {
        userId: ctx.userId,
        channelId: dmId,
        message: target,
      }),
    { route: "dm/read" },
  )

  return writeJSON({ ok: true })
})
