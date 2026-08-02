import { NextRequest } from "next/server"
import { queries, withD1Retry, MAX_FOLDER_NAME_LENGTH } from "@alook/shared"
import { getDb } from "@/lib/db"
import { withAuth } from "@/lib/middleware/auth"
import { writeJSON, writeError } from "@/lib/middleware/helpers"

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const folderId = ctx.params?.id
  if (!folderId) return writeError("missing folder id", 400)

  const db = getDb(ctx.env.DB)
  // `withD1Retry` (D1-armor state 2): folder ownership/existence gate — a
  // transient would 404 the owner's own folder; retry to truth.
  const folder = await withD1Retry(() => queries.communityServerFolder.getFolder(db, folderId, ctx.userId), {
    route: "server-folders/patch/folder",
  })
  if (!folder) return writeError("folder not found", 404)

  let body: { name?: string; serverIds?: string[] }
  try {
    body = await req.json()
  } catch {
    return writeError("invalid request body", 400)
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return writeError("name must be a non-empty string", 400)
    }
    const name = body.name.trim()
    if (name.length > MAX_FOLDER_NAME_LENGTH) {
      return writeError(`name must be ≤ ${MAX_FOLDER_NAME_LENGTH} characters`, 400)
    }
    // `withD1Retry` (state 3): updateFolder sets fields, idempotent.
    await withD1Retry(() => queries.communityServerFolder.updateFolder(db, folderId, { name }), {
      route: "server-folders/update",
    })
  }

  if (body.serverIds !== undefined) {
    if (!Array.isArray(body.serverIds)) {
      return writeError("serverIds must be an array", 400)
    }
    if (body.serverIds.length > 0) {
      // `withD1Retry` (D1-armor state 2): membership validation gate — a
      // transient false-empty would wrongly reject a member's own servers; retry.
      const memberServerIds = new Set(
        await withD1Retry(() => queries.communityMember.listMemberServerIds(db, ctx.userId), {
          route: "server-folders/patch/member-servers",
        }),
      )
      const stranger = body.serverIds.find((id) => !memberServerIds.has(id))
      if (stranger) {
        return writeError(`not a member of server ${stranger}`, 400)
      }
    }
    // `withD1Retry` (state 3): replaceFolderItems sets the item set to a value,
    // idempotent (re-running lands the same set).
    await withD1Retry(() => queries.communityServerFolder.replaceFolderItems(db, folderId, body.serverIds!), {
      route: "server-folders/replace-items",
    })
  }

  // `withD1Retry` (D1-armor state 2): readback for the response after the item
  // replace — a transient would drop the updated folder from the response; retry.
  const updated = await withD1Retry(() => queries.communityServerFolder.getFolder(db, folderId, ctx.userId), {
    route: "server-folders/patch/readback",
  })
  return writeJSON(updated)
})

export const DELETE = withAuth(async (_req, ctx) => {
  const folderId = ctx.params?.id
  if (!folderId) return writeError("missing folder id", 400)

  const db = getDb(ctx.env.DB)
  // `withD1Retry` (D1-armor state 2): folder ownership/existence gate — a
  // transient would 404 the owner's own folder; retry to truth.
  const folder = await withD1Retry(() => queries.communityServerFolder.getFolder(db, folderId, ctx.userId), {
    route: "server-folders/delete/folder",
  })
  if (!folder) return writeError("folder not found", 404)

  // `withD1Retry` (state 3): delete-by-key is idempotent.
  await withD1Retry(() => queries.communityServerFolder.deleteFolder(db, folderId), {
    route: "server-folders/delete",
  })

  return new Response(null, { status: 204 })
})
