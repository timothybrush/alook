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
const mockGetUserByNameAndDiscriminator = vi.fn()
const mockGetBotBinding = vi.fn()
const mockResolveServerByNameForMember = vi.fn()
const mockGetChannel = vi.fn()
const mockGetChannelForMember = vi.fn()
const mockGetDM = vi.fn()
const mockGetDMBetween = vi.fn()
const mockGetDMPeer = vi.fn()
const mockIsBlocked = vi.fn()
const mockBumpReadCursor = vi.fn()

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      ...actual.queries,
      communityMachine: { findActiveAgentRunnerKeyByBearer: (...a: unknown[]) => mockFindActiveAgentRunnerKeyByBearer(...a) },
      user: {
        getUserInternal: (...a: unknown[]) => mockGetUserInternal(...a),
        getUserByNameAndDiscriminator: (...a: unknown[]) => mockGetUserByNameAndDiscriminator(...a),
      },
      communityBot: { getBotBinding: (...a: unknown[]) => mockGetBotBinding(...a) },
      communityFriendship: { isBlocked: (...a: unknown[]) => mockIsBlocked(...a) },
      communityServer: { resolveServerByNameForMember: (...a: unknown[]) => mockResolveServerByNameForMember(...a) },
      communityChannel: {
        getChannel: (...a: unknown[]) => mockGetChannel(...a),
        getChannelForMember: (...a: unknown[]) => mockGetChannelForMember(...a),
      },
      communityDm: {
        getDM: (...a: unknown[]) => mockGetDM(...a),
        getDMBetween: (...a: unknown[]) => mockGetDMBetween(...a),
        getDMPeer: (...a: unknown[]) => mockGetDMPeer(...a),
      },
      communityReadState: { bumpReadCursor: (...a: unknown[]) => mockBumpReadCursor(...a) },
    },
  }
})

import { POST } from "./route"

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/community/agent/ack", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("POST /api/community/agent/ack", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindActiveAgentRunnerKeyByBearer.mockResolvedValue({ userId: "owner_1", machineId: "m_1", agentId: "bot_1" })
    mockGetUserInternal.mockResolvedValue({ isBot: true, deletedAt: null })
    mockGetBotBinding.mockResolvedValue({ machineId: "m_1", runtime: "claude" })
    mockResolveServerByNameForMember.mockResolvedValue([{ id: "srv_1" }])
    mockGetChannel.mockResolvedValue({ id: "ch_1", type: "text" })
    mockGetChannelForMember.mockResolvedValue({ id: "ch_1", serverId: "srv_1", type: "text", parentChannelId: null })
  })

  it("401 without Authorization", async () => {
    const res = await POST(req({ cursors: [{ channel: "/studio/general", seq: 3 }] }))
    expect(res.status).toBe(401)
  })

  it("400 when cursors is empty (schema requires min 1)", async () => {
    const res = await POST(req({ cursors: [] }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(400)
  })

  it("400 when a cursor uses seq 0 sentinel", async () => {
    const res = await POST(
      req({ cursors: [{ channel: "/studio/general", seq: 0 }] }, { Authorization: "Bearer crk_abc" })
    )
    expect(res.status).toBe(400)
    expect(mockBumpReadCursor).not.toHaveBeenCalled()
  })

  it("never auto-creates a DM/thread as a side effect — resolves with createDmIfMissing/createThreadIfMissing false", async () => {
    mockResolveServerByNameForMember.mockResolvedValue([])
    const res = await POST(
      req({ cursors: [{ channel: "/studio/general", seq: 3 }] }, { Authorization: "Bearer crk_abc" })
    )
    // Best-effort: an unresolvable cursor is reported in `failed`, not a
    // request-level error. Still never bumps (nothing resolved).
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.applied).toEqual([])
    expect(body.failed).toEqual([
      { channel: "/studio/general", seq: 3, code: "unresolvable", error: expect.any(String) },
    ])
    expect(mockBumpReadCursor).not.toHaveBeenCalled()
  })

  it("reports no_such_seq in failed[] (not a request error) when bumpReadCursor can't find that seq", async () => {
    mockBumpReadCursor.mockResolvedValue(null)
    const res = await POST(
      req({ cursors: [{ channelId: "ch_1", seq: 99 }] }, { Authorization: "Bearer crk_abc" })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.applied).toEqual([])
    expect(body.failed[0]).toMatchObject({ channel: "ch_1", seq: 99, code: "no_such_seq" })
    expect(body.failed[0].error).toMatch(/no message with seq #99/)
  })

  it("REGRESSION (the wedge): a bad cursor never stalls the good cursors behind it — good ones still apply and advance", async () => {
    // First cursor is a good top-level channel; SECOND carries an id that names
    // no channel (forum_post-style poison ref → unresolvable); THIRD is a
    // good DM. Under the old fail-fast this returned 404 and the DM after the
    // poison cursor never bumped — the exact mechanism that muted the bot.
    mockGetChannel.mockImplementation((_db: unknown, id: string) =>
      Promise.resolve(
        id === "ch_1"
          ? { id: "ch_1", type: "text" }
          : id === "dm_1"
            ? { id: "dm_1", type: "dm" }
            : undefined // ch_bad → unresolvable
      )
    )
    mockGetDM.mockResolvedValue({ id: "dm_1", lastMessageAt: null, createdAt: "t" })
    mockGetDMPeer.mockResolvedValue({ otherUserId: "peer_1" })
    mockIsBlocked.mockResolvedValue(false)
    mockBumpReadCursor.mockResolvedValue({ id: "m_1", createdAt: "t", seq: 1 })
    const res = await POST(
      req(
        {
          cursors: [
            { channelId: "ch_1", seq: 3 },
            { channelId: "ch_bad", seq: 5 },
            { channelId: "dm_1", seq: 1 },
          ],
        },
        { Authorization: "Bearer crk_abc" }
      )
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    // Both good cursors applied AND bumped — despite the poison cursor between them.
    expect(body.applied).toEqual([
      { channel: "ch_1", seq: 3 },
      { channel: "dm_1", seq: 1 },
    ])
    expect(body.failed).toEqual([
      { channel: "ch_bad", seq: 5, code: "unresolvable", error: expect.any(String) },
    ])
    expect(mockBumpReadCursor).toHaveBeenCalledTimes(2)
    expect(mockBumpReadCursor).toHaveBeenNthCalledWith(1, expect.anything(), "bot_1", { channelId: "ch_1" }, 3)
    expect(mockBumpReadCursor).toHaveBeenNthCalledWith(2, expect.anything(), "bot_1", { channelId: "dm_1" }, 1)
  })

  it("reports a forbidden cursor in failed[] while a sibling good cursor still applies", async () => {
    // First cursor resolves to a channel the bot isn't a member of; second is fine.
    // resolveTargetById gates once (call 1 passes), then the route re-affirms
    // membership on the resolved scope (call 2 → null → forbidden). Calls 3/4
    // (cursor 2) fall through to the beforeEach default (member) and apply.
    mockGetChannel.mockResolvedValue({ id: "ch_x", type: "text" })
    mockGetChannelForMember
      .mockResolvedValueOnce({ id: "ch_forbidden", serverId: "srv_1", type: "text", parentChannelId: null })
      .mockResolvedValueOnce(null) // route's explicit gate → requireChannelMember fails → forbidden
    mockBumpReadCursor.mockResolvedValue({ id: "m_1", createdAt: "t", seq: 2 })
    const res = await POST(
      req(
        {
          cursors: [
            { channelId: "ch_forbidden", seq: 7 },
            { channelId: "ch_1", seq: 2 },
          ],
        },
        { Authorization: "Bearer crk_abc" }
      )
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.applied).toEqual([{ channel: "ch_1", seq: 2 }])
    expect(body.failed[0]).toMatchObject({ channel: "ch_forbidden", seq: 7, code: "forbidden" })
    expect(mockBumpReadCursor).toHaveBeenCalledTimes(1)
  })

  it("propagates a genuine D1 exception as a 500 (never swallowed into failed[])", async () => {
    mockBumpReadCursor.mockRejectedValue(new Error("D1_ERROR: something non-retryable"))
    await expect(
      POST(req({ cursors: [{ channelId: "ch_1", seq: 3 }] }, { Authorization: "Bearer crk_abc" }))
    ).rejects.toThrow()
  })

  it("200 { ok: true } advances the cursor for every scope in the request, channel and DM alike", async () => {
    mockGetChannel.mockImplementation((_db: unknown, id: string) =>
      Promise.resolve(id === "dm_1" ? { id: "dm_1", type: "dm" } : { id: "ch_1", type: "text" })
    )
    mockGetDM.mockResolvedValue({ id: "dm_1", lastMessageAt: null, createdAt: "t" })
    mockGetDMPeer.mockResolvedValue({ otherUserId: "peer_1" })
    mockIsBlocked.mockResolvedValue(false)
    mockBumpReadCursor.mockResolvedValue({ id: "m_1", createdAt: "t", seq: 1 })
    const res = await POST(
      req(
        {
          cursors: [
            { channelId: "ch_1", seq: 3 },
            { channelId: "dm_1", seq: 1 },
          ],
        },
        { Authorization: "Bearer crk_abc" }
      )
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      applied: [
        { channel: "ch_1", seq: 3 },
        { channel: "dm_1", seq: 1 },
      ],
      failed: [],
    })
    expect(mockBumpReadCursor).toHaveBeenCalledTimes(2)
    expect(mockBumpReadCursor).toHaveBeenNthCalledWith(1, expect.anything(), "bot_1", { channelId: "ch_1" }, 3)
    expect(mockBumpReadCursor).toHaveBeenNthCalledWith(2, expect.anything(), "bot_1", { channelId: "dm_1" }, 1)
  })

  it("reports an invalid DM handle in failed[] as unresolvable (not a request error)", async () => {
    const res = await POST(
      req({ cursors: [{ channel: "/.dm/peer_1", seq: 1 }] }, { Authorization: "Bearer crk_abc" })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.failed[0]).toMatchObject({ channel: "/.dm/peer_1", seq: 1, code: "unresolvable" })
    expect(mockBumpReadCursor).not.toHaveBeenCalled()
  })
})
