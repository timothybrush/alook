import { NextResponse } from "next/server"
import { queries, withD1Retry } from "@alook/shared"
import type { Database } from "@alook/shared"
import { isUniqueConstraintError } from "@alook/shared"
import { guardDmOpen } from "./dm-guard"
import { isDmTarget } from "./message-handler"
import { requireChannelMember, requireDMAccess } from "./permissions"

export type TargetResolution =
  | { kind: "channel"; channelId: string }
  | { kind: "dm"; channelId: string; otherUserId: string }
  | { error: 400 | 403 | 404; message: string; hint?: Array<{ id: string; path: string }> }

// Name-path addressing has been RETIRED (ref/id addressing-id-ification,
// Gener). The old `resolveTargetForMember` — which parsed a `/server/channel`
// name-path and resolved it to an id at use-time — is gone: a name resolved at
// use-time silently mis-targets a renamed channel (the exact bug this reversal
// kills). Agents now address existing targets by a received ref's id
// (`resolveTargetById`) and open relationship channels by identity
// (`resolveTargetByCreate`); routes loud-reject a bare name-path
// (`nameRefRetiredResponse`). The DORMANT "resolve inline server-side" design
// this file once documented is intentionally removed, not dormant.
//
// (Server SELECTORS on `list` verbs — `--server <id-or-name>` in
// `listChannels`/`listMembers` — still resolve a server by name via
// `resolveServerByNameForMember`; that is a separate, still-supported path and
// was never part of the retired `--target`/`--channel` addressing.)

/**
 * id-first sibling of `resolveTargetForMember` (ref/id coexistence, PR-2). A
 * bot that already holds a `channelId` (from the read-side `{id, ref}` or a
 * body `{label}(channel/id)` ref) skips ref parsing and addresses by id
 * directly. Returns the SAME `TargetResolution` union so every action route
 * branches on one line: `body.channelId ? resolveTargetById(...) :
 * resolveTargetForMember(...)`.
 *
 * Critically this is NOT a bare id lookup: `resolveTargetForMember` fused three
 * jobs — ref→id, membership authorization (its `...ForMember` scoping 404s a
 * non-member), and DM/channel discrimination. Skipping ref parsing must NOT
 * skip the other two, or a bot could address a channel it isn't in by passing
 * a raw id (the class of the phase-1 DM block-bypass). So this path re-runs
 * both: discriminate DM vs channel from the channel row's type (the same
 * `type === "dm"` criterion `isDmTarget` keys on — no divergent DM test), then
 * gate through `requireDMAccess` (DM — also enforces the block check) /
 * `requireChannelMember` (channel). A non-member is rejected exactly as the ref
 * path rejects them; a missing/unknown id 404s (aligned with a missing ref).
 * Never auto-creates (no DM/thread materialization) — an id names an existing
 * row by definition.
 */
export async function resolveTargetById(
  db: Database,
  userId: string,
  channelId: string
): Promise<TargetResolution> {
  const channel = await withD1Retry(() => queries.communityChannel.getChannel(db, channelId), {
    route: "resolve-ref/by-id",
  })
  if (!channel) return { error: 404, message: `channel not found: ${channelId}` }

  if (isDmTarget(channel.type)) {
    const gate = await requireDMAccess(db, channelId, userId)
    if (!gate.ok) return { error: gate.status as 400 | 403 | 404, message: gate.error }
    return { kind: "dm", channelId, otherUserId: gate.value.otherUserId }
  }

  const gate = await requireChannelMember(db, channelId, userId)
  if (!gate.ok) return { error: gate.status as 400 | 403 | 404, message: gate.error }
  return { kind: "channel", channelId }
}

/**
 * Creation-by-identity resolver (ref/id addressing-id-ification, option A). A
 * relationship channel — a DM with a peer, a thread on a message — is OPENED by
 * identity (a `senderId` / `messageId` the caller received), not by a ref: the
 * first time, it has no ref. Both are idempotent open-or-create — an existing
 * DM/thread is returned as-is (`createOrGetDM` / the one-thread-per-message
 * unique constraint), never duplicated. Access is gated exactly as the id/ref
 * paths gate: a DM opens only if `guardDmOpen` allows (block/privacy check); a
 * thread roots only on a channel the caller can post in. `send` returns the
 * resolved target's canonical ref, so the caller collapses back to single-ref
 * addressing after the first open.
 *
 * Exactly one of `dmWithUserId` / `threadOnMessageId` is set (the route checks).
 */
export async function resolveTargetByCreate(
  db: Database,
  userId: string,
  args: { dmWithUserId?: string; threadOnMessageId?: string; callerKind?: "human" | "bot" }
): Promise<TargetResolution> {
  if (args.dmWithUserId !== undefined) {
    const peerId = args.dmWithUserId
    if (peerId === userId) return { error: 400, message: "can't open a DM with yourself" }
    // Idempotent open-or-create, guarded by the same block/privacy check the
    // name-path DM branch used. get-first-then-create → response-lost retry is
    // replay-safe (finds the existing row).
    const guard = await guardDmOpen(db, userId, peerId, { callerKind: args.callerKind })
    if (!guard.ok) return { error: guard.status, message: guard.error }
    const dm = await withD1Retry(
      () => queries.communityDm.createOrGetDM(db, { userId1: userId, userId2: peerId }),
      { route: "resolve-ref/create-dm-by-id" },
    )
    return { kind: "dm", channelId: dm.id, otherUserId: peerId }
  }

  if (args.threadOnMessageId !== undefined) {
    const rootMessage = await withD1Retry(
      () => queries.communityMessage.getMessage(db, args.threadOnMessageId!),
      { route: "resolve-ref/thread-root-by-id" },
    )
    if (!rootMessage) return { error: 404, message: `message not found: ${args.threadOnMessageId}` }
    // The thread roots on the message's own channel — gate that the caller can
    // post there (same membership gate the ref path applies to the parent).
    const gate = await requireChannelMember(db, rootMessage.channelId, userId)
    if (!gate.ok) return { error: gate.status as 400 | 403 | 404, message: gate.error }
    // A thread may only root on a top-level channel — never inside a thread or
    // forum post (mirrors the name-path guard + `createThreadChannel`'s DB check).
    if (gate.value.parentChannelId) {
      return { error: 400, message: "can't start a thread inside a thread or forum post" }
    }
    const existing = await withD1Retry(
      () => queries.communityChannel.getThreadChannelByParentMessage(db, rootMessage.channelId, rootMessage.id),
      { route: "resolve-ref/existing-thread-by-id" },
    )
    if (existing) return { kind: "channel", channelId: existing.id }
    try {
      const created = await withD1Retry(
        () => queries.communityChannel.createThreadChannel(db, rootMessage.channelId, rootMessage.id, userId),
        { route: "resolve-ref/create-thread-by-id" },
      )
      return { kind: "channel", channelId: created.id }
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const winner = await withD1Retry(
          () => queries.communityChannel.getThreadChannelByParentMessage(db, rootMessage.channelId, rootMessage.id),
          { route: "resolve-ref/thread-winner-by-id" },
        )
        if (winner) return { kind: "channel", channelId: winner.id }
      }
      throw err
    }
  }

  return { error: 400, message: "no creation target specified" }
}

/**
 * Convert a `resolveTargetForMember` error branch into the JSON error
 * response every agent route returns for it — shared so `send`/`ack`/`read`/
 * `resolve` don't each hand-roll the `{ error, hint? }` shape independently.
 * Callers narrow `resolved` to the error branch (`"error" in resolved`)
 * before calling this.
 */
export function resolveErrorResponse(
  resolved: Extract<TargetResolution, { error: 400 | 403 | 404 }>
): NextResponse {
  return NextResponse.json(
    { error: resolved.message, ...(resolved.hint ? { hint: resolved.hint } : {}) },
    { status: resolved.error }
  )
}

/**
 * Name-path addressing is RETIRED (ref/id addressing-id-ification, Gener). A
 * bare `/server/channel` path on `--target`/`--channel`/`--reply` is no longer
 * resolved server-side — a name resolved at use-time silently mis-targets a
 * renamed channel (the exact bug this reversal kills). Addressing is strict on
 * the name axis: a name-path is a LOUD 400 with a hint, never a silent resolve.
 * (Server selectors on `list` verbs — `--server <id-or-name>` — are a separate,
 * still-supported path and do NOT go through here.)
 */
export function nameRefRetiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "name-path addressing is no longer supported — a bare /server/channel path can't be a target",
      hint:
        "reuse a ref you received (the `channel` field on a pulled message, or a channel/message ref token) — re-`inbox pull` if you don't have it; to open a DM/thread use `--dm-user`/`--thread-on`",
    },
    { status: 400 }
  )
}
