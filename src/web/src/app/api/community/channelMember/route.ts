import { NextResponse, type NextRequest } from "next/server"
import {
  queries,
  withD1Retry,
  CommunityAgentChannelMemberRequestSchema,
  formatHandle,
  isThread,
} from "@alook/shared"
import type {
  CommunityCliChannelMemberResult as ChannelMemberResult,
  CommunityCliServerMember as ServerMember,
} from "@alook/shared"
import { getDb } from "@/lib/db"
import { withCommunityActor, requireBot } from "@/lib/middleware/community-actor"
import { resolveTargetById, resolveErrorResponse, nameRefRetiredResponse } from "@/lib/community/resolve-ref"
import { requireChannelAccess } from "@/lib/community/permissions"

/**
 * POST /api/community/channelMember — `alook channel member --channel <ref>`.
 * Returns the followed members of a channel/thread.
 *
 * Moved from /agent (plan §4 MOVE-FLAT, §9 phase 3); bot-only, human actor →
 * 403 via requireBot.
 *
 * Branches by resolved target:
 *   - DM ref → 400 (channel-scoped). Rejected UP FRONT (before
 *     `resolveTargetForMember`) so an un-opened DM surfaces the correct
 *     channel-scoped 400 instead of a misleading 404 "dm not found".
 *   - thread (`type = "thread"`) → always private on the wire; returns the
 *     participant roster (`community_thread_participant`). Threads are the
 *     NOTIFY dimension: they carry their own notify set irrespective of the
 *     parent channel's public/private state. Forum posts share this shape but
 *     are not agent-addressable via any current ref grammar, so this branch
 *     only fires for threads reached via `<server>/<channel>/#N`.
 *   - public top-level channel/forum → `{ visibility: "public", hint }` (no
 *     roster enumeration — every server member can see it, so the agent should
 *     use `alook server member --server <name>` instead).
 *   - private channel / private forum → `{ visibility: "private", members }`
 *     sourced from `resolveScopeMembers` (the same audience the fan-out and
 *     human UI use).
 */
export const POST = withCommunityActor(async (req: NextRequest, ctx) => {
  const gate = requireBot(ctx.actor)
  if (!gate.ok) return gate.response
  const botUserId = gate.bot.userId
  const db = getDb(ctx.env.DB)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }
  const parsed = CommunityAgentChannelMemberRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }

  // Name-path addressing is retired — loud 400. A DM channel reached by id is
  // still rejected below (channel member is channel-scoped) via resolved.kind.
  if (parsed.data.channelId === undefined) return nameRefRetiredResponse()
  const resolved = await resolveTargetById(db, botUserId, parsed.data.channelId)
  if ("error" in resolved) return resolveErrorResponse(resolved)
  if (resolved.kind === "dm") {
    return NextResponse.json(
      { error: "channel member is channel-scoped — DM refs are not supported" },
      { status: 400 },
    )
  }

  const channelId = resolved.channelId
  const access = await requireChannelAccess(db, channelId, botUserId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { channel, isPrivate } = access.value

  // Thread branch: the NOTIFY dimension — the roster is the participant set
  // (`community_thread_participant`), always private on the wire regardless of
  // the parent's public/private state. Forum posts are not agent-addressable,
  // so this handler only sees `thread` or top-level channel rows here.
  // `withD1Retry` (D1-armor: no-fallback roster reads; retry to truth).
  if (isThread(channel.type)) {
    const userIds = await withD1Retry(
      () => queries.communityThread.listThreadParticipantUserIds(db, channelId),
      { route: "channelMember/thread-participants" },
    )
    const members = await hydrateMembers(db, channel.serverId, userIds)
    return NextResponse.json<ChannelMemberResult>({ visibility: "private", members })
  }

  if (!isPrivate) {
    const server = await withD1Retry(() => queries.communityServer.getServer(db, channel.serverId), {
      route: "channelMember/server",
    })
    const serverName = server?.name ?? channel.serverId
    const hint = `This channel is public. Use \`alook server member --server ${serverName}\` to list who can see it.`
    return NextResponse.json<ChannelMemberResult>({ visibility: "public", hint })
  }

  const scoped = await withD1Retry(
    () => queries.communityMembersResolver.resolveScopeMembers(db, { scope: "channel", scopeId: channelId }),
    { route: "channelMember/scope-members" },
  )
  const userIds = scoped.map((s) => s.userId)
  const members = await hydrateMembers(db, channel.serverId, userIds)
  return NextResponse.json<ChannelMemberResult>({ visibility: "private", members })
})

/**
 * Hydrate a user id list into `ServerMember[]` — mirrors `listMembers`'s
 * mapping (formatHandle, default role "member", nickname iff set). Users
 * whose account is soft-deleted drop out via `getMembersByUserIds`'s inner
 * join on `user`. Users missing a `community_server_member` row (shouldn't
 * happen in normal flow) also drop out; they never surface as a stub row.
 */
async function hydrateMembers(
  db: ReturnType<typeof getDb>,
  serverId: string,
  userIds: string[],
): Promise<ServerMember[]> {
  if (userIds.length === 0) return []
  const rows = await withD1Retry(
    () => queries.communityMember.getMembersByUserIds(db, serverId, userIds),
    { route: "channelMember/hydrate" },
  )
  return rows.map((r) => ({
    handle: formatHandle(r.userName ?? "", r.discriminator ?? "0000"),
    role: r.role ?? "member",
  }))
}
