import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({ env: { DB: {} } })),
}))
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }))
// Unified actor: a request with no `crk_` bearer falls through to the human
// withAuth path. Mock Better-Auth to resolve "no session" so a no-auth request
// yields the human-path 401 ("unauthorized") — the real unified-actor contract —
// instead of a 503 from unmocked session validation.
vi.mock("@/lib/auth", () => ({
  createAuth: vi.fn(() => ({
    api: { getSession: vi.fn(async () => ({ headers: new Headers(), response: null })) },
  })),
}))

const mockFindActiveAgentRunnerKeyByBearer = vi.fn()
const mockGetUserInternal = vi.fn()
const mockGetBotBinding = vi.fn()
const mockGetServer = vi.fn()
const mockGetChannel = vi.fn()
const mockGetChannelForMember = vi.fn()
const mockResolveChannelAccessContext = vi.fn()
const mockListThreadParticipantUserIds = vi.fn()
const mockResolveScopeMembers = vi.fn()
const mockGetMembersByUserIds = vi.fn()
const mockGetDM = vi.fn()
const mockGetDMPeer = vi.fn()
const mockIsBlocked = vi.fn()

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      ...actual.queries,
      communityMachine: { findActiveAgentRunnerKeyByBearer: (...a: unknown[]) => mockFindActiveAgentRunnerKeyByBearer(...a) },
      user: {
        ...actual.queries.user,
        getUserInternal: (...a: unknown[]) => mockGetUserInternal(...a),
      },
      communityBot: { getBotBinding: (...a: unknown[]) => mockGetBotBinding(...a) },
      communityServer: {
        ...actual.queries.communityServer,
        getServer: (...a: unknown[]) => mockGetServer(...a),
      },
      communityChannel: {
        ...actual.queries.communityChannel,
        getChannel: (...a: unknown[]) => mockGetChannel(...a),
        getChannelForMember: (...a: unknown[]) => mockGetChannelForMember(...a),
        resolveChannelAccessContext: (...a: unknown[]) => mockResolveChannelAccessContext(...a),
      },
      communityThread: {
        ...actual.queries.communityThread,
        listThreadParticipantUserIds: (...a: unknown[]) => mockListThreadParticipantUserIds(...a),
      },
      communityMembersResolver: {
        ...actual.queries.communityMembersResolver,
        resolveScopeMembers: (...a: unknown[]) => mockResolveScopeMembers(...a),
      },
      communityMember: {
        ...actual.queries.communityMember,
        getMembersByUserIds: (...a: unknown[]) => mockGetMembersByUserIds(...a),
      },
      communityDm: {
        ...actual.queries.communityDm,
        getDM: (...a: unknown[]) => mockGetDM(...a),
        getDMPeer: (...a: unknown[]) => mockGetDMPeer(...a),
      },
      communityFriendship: {
        ...actual.queries.communityFriendship,
        isBlocked: (...a: unknown[]) => mockIsBlocked(...a),
      },
    },
  }
})

import { POST } from "./route"

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/community/agent/channelMember", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("POST /api/community/agent/channelMember", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindActiveAgentRunnerKeyByBearer.mockResolvedValue({ userId: "owner_1", machineId: "m_1", agentId: "bot_1" })
    mockGetUserInternal.mockResolvedValue({ isBot: true, deletedAt: null })
    mockGetBotBinding.mockResolvedValue({ machineId: "m_1", runtime: "claude" })
    // resolveTargetById defaults: the channelId resolves to a text channel the
    // bot is a member of (getChannel discriminates DM-vs-channel by `type`;
    // getChannelForMember gates membership in requireChannelMember).
    mockGetChannel.mockResolvedValue({ id: "ch_1", type: "text" })
    mockGetChannelForMember.mockResolvedValue({ id: "ch_1", serverId: "srv_1", type: "text", parentChannelId: null })
    // Default: bot has channel access (server member, public channel).
    mockResolveChannelAccessContext.mockResolvedValue({
      channel: { id: "ch_1", serverId: "srv_1", type: "text", parentChannelId: null, creatorId: "owner_1", categoryId: null },
      anchor: { id: "ch_1", type: "text", creatorId: "owner_1", categoryId: null },
      role: "member",
      isChannelMember: false,
      isCreator: false,
      isPrivate: false,
    })
  })

  it("401 without Authorization", async () => {
    const res = await POST(req({ channelId: "ch_1" }))
    expect(res.status).toBe(401)
  })

  it("400 on payload validation failure (missing channel/channelId)", async () => {
    const res = await POST(req({}, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(400)
  })

  it("400 loud-reject on a bare name-path (addressing is id-only)", async () => {
    // Name-path addressing is retired: a `/server/channel` path carries no
    // channelId, so the route loud-rejects up front instead of resolving it.
    const res = await POST(req({ channel: "/studio/general" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("name-path")
    expect(body.hint).toBeTruthy()
    // Never reaches target resolution.
    expect(mockGetChannel).not.toHaveBeenCalled()
    expect(mockResolveChannelAccessContext).not.toHaveBeenCalled()
  })

  it("400 on a DM channelId — channel member is channel-scoped", async () => {
    // A channelId that names a DM row resolves to `kind: "dm"`; channel member
    // is channel-scoped, so it's rejected AFTER resolution (via resolved.kind)
    // rather than by a name-parse. DM gate mocks make resolveTargetById return
    // a DM target.
    mockGetChannel.mockResolvedValue({ id: "dm_1", type: "dm" })
    mockGetDM.mockResolvedValue({ id: "dm_1", lastMessageAt: null, createdAt: "t" })
    mockGetDMPeer.mockResolvedValue({ otherUserId: "peer_1" })
    mockIsBlocked.mockResolvedValue(false)
    const res = await POST(req({ channelId: "dm_1" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("channel-scoped")
    // Rejected before any channel-access/roster work.
    expect(mockResolveChannelAccessContext).not.toHaveBeenCalled()
  })

  it("404 when the channelId names no channel", async () => {
    mockGetChannel.mockResolvedValue(undefined)
    const res = await POST(req({ channelId: "ch_missing" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(404)
  })

  it("403 when the bot is not a member of the channel", async () => {
    // getChannelForMember returns null for a non-member → requireChannelMember 403.
    mockGetChannelForMember.mockResolvedValue(undefined)
    const res = await POST(req({ channelId: "ch_1" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(403)
  })

  it("public top-level channel → { visibility:'public', hint } with the server's actual name substituted", async () => {
    mockGetServer.mockResolvedValue({ id: "srv_1", name: "demo" })
    const res = await POST(req({ channelId: "ch_1" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      visibility: "public",
      hint: "This channel is public. Use `alook server member --server demo` to list who can see it.",
    })
    expect("members" in body).toBe(false)
  })

  it("private top-level channel → { visibility:'private', members } from resolveScopeMembers", async () => {
    // Access context: bot is the creator (so it can see the private channel).
    mockResolveChannelAccessContext.mockResolvedValue({
      channel: { id: "ch_1", serverId: "srv_1", type: "text", parentChannelId: null, creatorId: "bot_1", categoryId: "cat_1" },
      anchor: { id: "ch_1", type: "text", creatorId: "bot_1", categoryId: "cat_1" },
      role: "member",
      isChannelMember: false,
      isCreator: true,
      isPrivate: true,
    })
    mockResolveScopeMembers.mockResolvedValue([
      { userId: "u_owner", role: "owner", source: "explicit" },
      { userId: "u_alice", role: "member", source: "explicit" },
    ])
    mockGetMembersByUserIds.mockResolvedValue([
      { userName: "gustavo", discriminator: "4821", role: "owner" },
      { userName: "alice", discriminator: "0193", role: "member" },
    ])
    const res = await POST(req({ channelId: "ch_1" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      visibility: "private",
      members: [
        { handle: "gustavo#4821", role: "owner" },
        { handle: "alice#0193", role: "member" },
      ],
    })
  })

  it("thread ref → always private on the wire; roster is the thread-participant set", async () => {
    // The received channelId already names the thread channel (th_1); no name
    // resolution needed. getChannel discriminates non-DM; getChannelForMember
    // gates membership; access context marks it a thread.
    mockGetChannel.mockResolvedValue({ id: "th_1", type: "thread" })
    mockGetChannelForMember.mockResolvedValue({ id: "th_1", serverId: "srv_1", type: "thread", parentChannelId: "ch_parent" })
    mockResolveChannelAccessContext.mockResolvedValue({
      channel: { id: "th_1", serverId: "srv_1", type: "thread", parentChannelId: "ch_parent", creatorId: "bot_1", categoryId: null },
      anchor: { id: "ch_parent", type: "text", creatorId: "owner_1", categoryId: null },
      role: "member",
      isChannelMember: false,
      isCreator: false,
      isPrivate: false,
    })
    mockListThreadParticipantUserIds.mockResolvedValue(["u_owner", "u_bot"])
    mockGetMembersByUserIds.mockResolvedValue([
      { userName: "gustavo", discriminator: "4821", role: "owner", nickname: null },
      { userName: "otter", discriminator: "5522", role: "member", nickname: null },
    ])

    const res = await POST(req({ channelId: "th_1" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.visibility).toBe("private")
    expect(body.members).toEqual([
      { handle: "gustavo#4821", role: "owner" },
      { handle: "otter#5522", role: "member" },
    ])
    expect(mockListThreadParticipantUserIds).toHaveBeenCalledWith(expect.anything(), "th_1")
  })

  // Forum posts are not agent-addressable via any current ref grammar
  // (`resolveChannelByNameForMember` filters `parent_channel_id IS NULL`
  // and `#N` refs materialize as `type: "thread"`), so there is no code
  // path that reaches this handler with a `forum_post` row. If forum-post
  // refs are ever reintroduced, add a test back here.
})
