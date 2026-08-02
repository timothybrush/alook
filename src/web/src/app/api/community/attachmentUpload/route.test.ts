import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const mockR2Delete = vi.fn(async () => undefined)
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { DB: {}, COMMUNITY_MEDIA: { put: vi.fn(), delete: (...a: unknown[]) => mockR2Delete(...(a as [])) } },
  })),
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
const mockGetChannel = vi.fn()
const mockGetChannelForMember = vi.fn()
const mockGetDM = vi.fn()
const mockGetDMPeer = vi.fn()
const mockCreatePendingAttachment = vi.fn()

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      ...actual.queries,
      communityMachine: { findActiveAgentRunnerKeyByBearer: (...a: unknown[]) => mockFindActiveAgentRunnerKeyByBearer(...a) },
      user: { getUserInternal: (...a: unknown[]) => mockGetUserInternal(...a) },
      communityBot: { getBotBinding: (...a: unknown[]) => mockGetBotBinding(...a) },
      communityChannel: {
        getChannel: (...a: unknown[]) => mockGetChannel(...a),
        getChannelForMember: (...a: unknown[]) => mockGetChannelForMember(...a),
      },
      communityDm: {
        getDM: (...a: unknown[]) => mockGetDM(...a),
        getDMPeer: (...a: unknown[]) => mockGetDMPeer(...a),
      },
      communityFriendship: { isBlocked: async () => false },
      communityAttachment: {
        createPendingAttachment: (...a: unknown[]) => mockCreatePendingAttachment(...a),
      },
    },
  }
})

const mockHandleAttachmentUpload = vi.fn()
vi.mock("@/lib/community/upload", () => ({
  handleAttachmentUpload: (...a: unknown[]) => mockHandleAttachmentUpload(...a),
}))

import { POST } from "./route"

function req(channelId: string | null, headers: Record<string, string> = {}): NextRequest {
  const q = channelId !== null ? `?channelId=${encodeURIComponent(channelId)}` : ""
  return new NextRequest(`http://localhost/api/community/agent/attachmentUpload${q}`, {
    method: "POST",
    headers,
  })
}

// Builds a request that addresses by a bare name-path (`?target=`) — the
// retired addressing, kept here to assert it now loud-rejects 400.
function reqNamePath(target: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    `http://localhost/api/community/agent/attachmentUpload?target=${encodeURIComponent(target)}`,
    { method: "POST", headers },
  )
}

describe("POST /api/community/agent/attachmentUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindActiveAgentRunnerKeyByBearer.mockResolvedValue({ userId: "owner_1", machineId: "m_1", agentId: "bot_1" })
    mockGetUserInternal.mockResolvedValue({ isBot: true, deletedAt: null })
    mockGetBotBinding.mockResolvedValue({ machineId: "m_1", runtime: "claude" })
    // id-path defaults: a text channel the bot is a member of.
    mockGetChannel.mockResolvedValue({ id: "ch_1", type: "text" })
    mockGetChannelForMember.mockResolvedValue({ id: "ch_1", serverId: "srv_1", type: "text", parentChannelId: null })
    mockCreatePendingAttachment.mockResolvedValue({
      id: "att_1",
      filename: "hi.png",
      contentType: "image/png",
      size: 10,
    })
    mockHandleAttachmentUpload.mockResolvedValue({
      ok: true,
      r2Key: "channel/c1/uuid/hi.png",
      filename: "hi.png",
      contentType: "image/png",
      size: 10,
    })
  })

  it("401 without Authorization", async () => {
    const res = await POST(req("ch_1"))
    expect(res.status).toBe(401)
  })

  it("400 when channelId + target query params are both missing", async () => {
    const res = await POST(req(null, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(400)
  })

  it("400 loud-rejects a bare name-path target (name addressing retired)", async () => {
    const res = await POST(reqNamePath("/studio/general", { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
    expect(body.hint).toBeTruthy()
    expect(mockGetChannel).not.toHaveBeenCalled()
  })

  it("returns id + filename + contentType + size — no url, no r2Key", async () => {
    const res = await POST(req("ch_1", { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      id: "att_1",
      filename: "hi.png",
      contentType: "image/png",
      size: 10,
    })
    // No leaked internals.
    expect(body.url).toBeUndefined()
    expect(body.r2Key).toBeUndefined()
    // Uploader tag is threaded to the R2 primitive.
    expect(mockHandleAttachmentUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "channel",
      "ch_1",
      { uploader: "bot", uploaderUserId: "bot_1" },
    )
    expect(mockCreatePendingAttachment).toHaveBeenCalledWith({}, expect.objectContaining({
      uploaderId: "bot_1",
      targetId: "ch_1",
      r2Key: "channel/c1/uuid/hi.png",
    }))
  })

  it("createPendingAttachment throws → 500 JSON envelope, R2 delete fired with r2Key", async () => {
    mockCreatePendingAttachment.mockRejectedValueOnce(new Error("d1_transient"))

    const res = await POST(req("ch_1", { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: "internal error", code: "internal" })
    expect(mockR2Delete).toHaveBeenCalledWith("channel/c1/uuid/hi.png")
  })

  it("createPendingAttachment throws AND R2 delete also throws → still 500 JSON, no rethrow", async () => {
    mockCreatePendingAttachment.mockRejectedValueOnce(new Error("d1_transient"))
    mockR2Delete.mockRejectedValueOnce(new Error("r2_boom"))

    const res = await POST(req("ch_1", { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "internal error", code: "internal" })
  })

  it("pre-R2 throw (resolveTargetById errors) → 500 JSON, R2 delete NOT called", async () => {
    mockGetChannel.mockRejectedValueOnce(new Error("d1_outage"))

    const res = await POST(req("ch_1", { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "internal error", code: "internal" })
    expect(mockR2Delete).not.toHaveBeenCalled()
  })

  it("propagates handler failure response verbatim", async () => {
    mockHandleAttachmentUpload.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "file too large" }), { status: 413 }),
    })

    const res = await POST(req("ch_1", { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(413)
    expect(mockCreatePendingAttachment).not.toHaveBeenCalled()
  })
})
