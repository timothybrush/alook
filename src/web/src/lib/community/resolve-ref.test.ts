import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetUserInternal = vi.fn()
const mockGetUserByNameAndDiscriminator = vi.fn()
const mockAreFriends = vi.fn()
const mockIsBlocked = vi.fn()
const mockCreateOrGetDM = vi.fn()
const mockGetDMBetween = vi.fn()
const mockResolveServerByNameForMember = vi.fn()
const mockResolveChannelByNameForMember = vi.fn()
const mockGetMessageByChannelAndSeq = vi.fn()
const mockGetMessage = vi.fn()
const mockGetThreadChannelByParentMessage = vi.fn()
const mockCreateThreadChannel = vi.fn()
const mockGetChildChannelByName = vi.fn()
const mockIsUniqueConstraintError = vi.fn(() => false)
const mockGetChannel = vi.fn()
const mockGetChannelForMember = vi.fn()
const mockGetDM = vi.fn()
const mockGetDMPeer = vi.fn()

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    isUniqueConstraintError: (...a: unknown[]) => mockIsUniqueConstraintError(...a),
    queries: {
      user: {
        getUserInternal: (...a: unknown[]) => mockGetUserInternal(...a),
        getUserByNameAndDiscriminator: (...a: unknown[]) => mockGetUserByNameAndDiscriminator(...a),
      },
      communityFriendship: {
        areFriends: (...a: unknown[]) => mockAreFriends(...a),
        isBlocked: (...a: unknown[]) => mockIsBlocked(...a),
      },
      communityServer: {
        resolveServerByNameForMember: (...a: unknown[]) => mockResolveServerByNameForMember(...a),
      },
      communityChannel: {
        resolveChannelByNameForMember: (...a: unknown[]) => mockResolveChannelByNameForMember(...a),
        getThreadChannelByParentMessage: (...a: unknown[]) => mockGetThreadChannelByParentMessage(...a),
        createThreadChannel: (...a: unknown[]) => mockCreateThreadChannel(...a),
        getChildChannelByName: (...a: unknown[]) => mockGetChildChannelByName(...a),
        getChannel: (...a: unknown[]) => mockGetChannel(...a),
        getChannelForMember: (...a: unknown[]) => mockGetChannelForMember(...a),
      },
      communityDm: {
        createOrGetDM: (...a: unknown[]) => mockCreateOrGetDM(...a),
        getDMBetween: (...a: unknown[]) => mockGetDMBetween(...a),
        getDM: (...a: unknown[]) => mockGetDM(...a),
        getDMPeer: (...a: unknown[]) => mockGetDMPeer(...a),
      },
      communityMessage: {
        getMessageByChannelAndSeq: (...a: unknown[]) => mockGetMessageByChannelAndSeq(...a),
        getMessage: (...a: unknown[]) => mockGetMessage(...a),
      },
    },
  }
})

import { resolveTargetByCreate, resolveTargetById, resolveErrorResponse } from "./resolve-ref"

const db = {} as never

describe("resolveTargetById (id-first path, ref/id PR-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("404 when the channelId names no channel", async () => {
    mockGetChannel.mockResolvedValue(undefined)
    const res = await resolveTargetById(db, "u_1", "ch_missing")
    expect(res).toEqual({ error: 404, message: "channel not found: ch_missing" })
  })

  it("resolves a channel id (member) to { kind: channel, channelId }", async () => {
    mockGetChannel.mockResolvedValue({ id: "ch_1", type: "text" })
    mockGetChannelForMember.mockResolvedValue({ id: "ch_1", type: "text", serverId: "srv_1" })
    const viaId = await resolveTargetById(db, "u_1", "ch_1")
    expect(viaId).toEqual({ kind: "channel", channelId: "ch_1" })
  })

  it("404 (NOT 403) when a NON-member passes a channel id directly — existence non-disclosure", async () => {
    // A no-access channel must be indistinguishable from a nonexistent one at
    // the agent boundary (Aigneis security invariant): the channel-membership
    // 403 collapses to the same 404 a missing channel returns, so a
    // cross-channel ref can't be used as an existence oracle. (The DM branch
    // keeps its 403 "blocked" — a legit diagnosis that leaks no new existence.)
    mockGetChannel.mockResolvedValue({ id: "ch_1", type: "text" })
    mockGetChannelForMember.mockResolvedValue(undefined) // non-member
    const res = await resolveTargetById(db, "outsider", "ch_1")
    expect(res).toEqual({ error: 404, message: "channel not found: ch_1" })
  })

  it("resolves a DM id (participant) to { kind: dm, otherUserId }", async () => {
    mockGetChannel.mockResolvedValue({ id: "dm_1", type: "dm" })
    mockGetDM.mockResolvedValue({ id: "dm_1", lastMessageAt: null, createdAt: "t" })
    mockGetDMPeer.mockResolvedValue({ otherUserId: "peer_1" })
    mockIsBlocked.mockResolvedValue(false)
    const res = await resolveTargetById(db, "u_1", "dm_1")
    expect(res).toEqual({ kind: "dm", channelId: "dm_1", otherUserId: "peer_1" })
  })

  it("404 when a NON-participant passes a DM id directly (no authz bypass)", async () => {
    mockGetChannel.mockResolvedValue({ id: "dm_1", type: "dm" })
    mockGetDM.mockResolvedValue({ id: "dm_1", lastMessageAt: null, createdAt: "t" })
    // getDMPeer returns null for a non-participant → requireDMAccess 404 "dm not found".
    mockGetDMPeer.mockResolvedValue(undefined)
    const res = await resolveTargetById(db, "outsider", "dm_1")
    expect(res).toEqual({ error: 404, message: "dm not found" })
  })

  it("403 when a DM participant is blocked (block check not bypassed on id path)", async () => {
    mockGetChannel.mockResolvedValue({ id: "dm_1", type: "dm" })
    mockGetDM.mockResolvedValue({ id: "dm_1", lastMessageAt: null, createdAt: "t" })
    mockGetDMPeer.mockResolvedValue({ otherUserId: "peer_1" })
    mockIsBlocked.mockResolvedValue(true)
    const res = await resolveTargetById(db, "u_1", "dm_1")
    expect(res).toEqual({ error: 403, message: "blocked" })
  })
})

describe("resolveTargetByCreate (open-or-create by identity, ref/id addressing-id-ification)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsUniqueConstraintError.mockReturnValue(false)
  })

  it("--dm-user: opens (or creates) a DM with a peer, gated → { kind: dm, otherUserId }", async () => {
    mockGetUserInternal.mockResolvedValue({ id: "peer_1", deletedAt: null, isBot: false })
    mockIsBlocked.mockResolvedValue(false)
    mockCreateOrGetDM.mockResolvedValue({ id: "dm_1" })
    const res = await resolveTargetByCreate(db, "u_1", { dmWithUserId: "peer_1", callerKind: "bot" })
    expect(res).toEqual({ kind: "dm", channelId: "dm_1", otherUserId: "peer_1" })
    expect(mockCreateOrGetDM).toHaveBeenCalledWith(db, { userId1: "u_1", userId2: "peer_1" })
  })

  it("--dm-user with self → 400, never touches the DB", async () => {
    const res = await resolveTargetByCreate(db, "u_1", { dmWithUserId: "u_1", callerKind: "bot" })
    expect(res).toEqual({ error: 400, message: "can't open a DM with yourself" })
    expect(mockCreateOrGetDM).not.toHaveBeenCalled()
  })

  it("--dm-user blocked by the DM guard (bot not friends with a bot peer) → 403, no create", async () => {
    mockGetUserInternal.mockResolvedValue({ id: "peer_1", deletedAt: null, isBot: true, ownerUserId: "someone_else" })
    mockAreFriends.mockResolvedValue(false) // bot not friends → guard 403
    const res = await resolveTargetByCreate(db, "u_1", { dmWithUserId: "peer_1", callerKind: "bot" })
    expect(res).toEqual({ error: 403, message: "not friends with this bot" })
    expect(mockCreateOrGetDM).not.toHaveBeenCalled()
  })

  it("--thread-on: opens an existing thread on a message the caller can post to", async () => {
    mockGetMessage.mockResolvedValue({ id: "m_root", channelId: "ch_parent" })
    mockGetChannelForMember.mockResolvedValue({ id: "ch_parent", type: "text", parentChannelId: null })
    mockGetThreadChannelByParentMessage.mockResolvedValue({ id: "thread_1" })
    const res = await resolveTargetByCreate(db, "u_1", { threadOnMessageId: "m_root", callerKind: "bot" })
    expect(res).toEqual({ kind: "channel", channelId: "thread_1" })
    expect(mockCreateThreadChannel).not.toHaveBeenCalled()
  })

  it("--thread-on: creates the thread when none exists yet", async () => {
    mockGetMessage.mockResolvedValue({ id: "m_root", channelId: "ch_parent" })
    mockGetChannelForMember.mockResolvedValue({ id: "ch_parent", type: "text", parentChannelId: null })
    mockGetThreadChannelByParentMessage.mockResolvedValue(undefined)
    mockCreateThreadChannel.mockResolvedValue({ id: "thread_new" })
    const res = await resolveTargetByCreate(db, "u_1", { threadOnMessageId: "m_root", callerKind: "bot" })
    expect(res).toEqual({ kind: "channel", channelId: "thread_new" })
    expect(mockCreateThreadChannel).toHaveBeenCalledWith(db, "ch_parent", "m_root", "u_1")
  })

  it("--thread-on a missing message → 404", async () => {
    mockGetMessage.mockResolvedValue(null)
    const res = await resolveTargetByCreate(db, "u_1", { threadOnMessageId: "m_gone", callerKind: "bot" })
    expect(res).toEqual({ error: 404, message: "message not found: m_gone" })
  })

  it("--thread-on when the caller can't post to the root's channel → 404 (existence non-disclosure), no create", async () => {
    mockGetMessage.mockResolvedValue({ id: "m_root", channelId: "ch_parent" })
    mockGetChannelForMember.mockResolvedValue(undefined) // non-member → 403 collapses to 404
    const res = await resolveTargetByCreate(db, "outsider", { threadOnMessageId: "m_root", callerKind: "bot" })
    expect(res).toEqual({ error: 404, message: "message not found: m_root" })
    expect(mockCreateThreadChannel).not.toHaveBeenCalled()
  })

  it("--thread-on a message inside a thread/forum-post → 400 (no nested threads)", async () => {
    mockGetMessage.mockResolvedValue({ id: "m_root", channelId: "thread_x" })
    mockGetChannelForMember.mockResolvedValue({ id: "thread_x", type: "thread", parentChannelId: "ch_parent" })
    const res = await resolveTargetByCreate(db, "u_1", { threadOnMessageId: "m_root", callerKind: "bot" })
    expect(res).toEqual({ error: 400, message: "can't start a thread inside a thread or forum post" })
    expect(mockCreateThreadChannel).not.toHaveBeenCalled()
  })
})

describe("resolveErrorResponse", () => {
  it("maps error+message to a JSON response with matching status, no hint key when absent", async () => {
    const res = resolveErrorResponse({ error: 404, message: "not found" })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "not found" })
  })

  it("includes hint when present", async () => {
    const res = resolveErrorResponse({
      error: 400,
      message: "ambiguous",
      hint: [{ id: "a", path: "/a/b" }],
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "ambiguous", hint: [{ id: "a", path: "/a/b" }] })
  })
})
