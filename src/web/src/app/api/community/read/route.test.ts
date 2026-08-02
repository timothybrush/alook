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
const mockGetChannel = vi.fn()
const mockGetChannelForMember = vi.fn()
const mockListMessagesBySeq = vi.fn()
const mockToAgentMessages = vi.fn()

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
      communityAgentInbox: {
        listMessagesBySeq: (...a: unknown[]) => mockListMessagesBySeq(...a),
        toAgentMessages: (...a: unknown[]) => mockToAgentMessages(...a),
      },
    },
  }
})

import { POST } from "./route"

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/community/agent/read", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("POST /api/community/agent/read", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindActiveAgentRunnerKeyByBearer.mockResolvedValue({ userId: "owner_1", machineId: "m_1", agentId: "bot_1" })
    mockGetUserInternal.mockResolvedValue({ isBot: true, deletedAt: null })
    mockGetBotBinding.mockResolvedValue({ machineId: "m_1", runtime: "claude" })
    mockGetChannel.mockResolvedValue({ id: "ch_1", type: "text" })
    mockGetChannelForMember.mockResolvedValue({ id: "ch_1", serverId: "srv_1", type: "text", parentChannelId: null })
    mockToAgentMessages.mockImplementation((_db: unknown, rows: unknown[]) => Promise.resolve(rows))
  })

  it("401 without Authorization", async () => {
    const res = await POST(req({ channel: "/studio/general" }))
    expect(res.status).toBe(401)
  })

  it("400 when more than one of before/after/around is supplied", async () => {
    const res = await POST(
      req({ channelId: "ch_1", before: 5, after: 1 }, { Authorization: "Bearer crk_abc" })
    )
    expect(res.status).toBe(400)
  })

  it("403 forbidden when the bot isn't a member of the resolved channel", async () => {
    mockGetChannelForMember.mockResolvedValue(null)
    const res = await POST(req({ channelId: "ch_1" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(403)
  })

  it("200 happy path: returns { items, hasMore, latestSeq } from listMessagesBySeq", async () => {
    mockListMessagesBySeq.mockResolvedValue({
      items: [{ id: "m_1", seq: 1 }, { id: "m_2", seq: 2 }],
      hasMore: true,
      latestSeq: 2,
    })
    const res = await POST(req({ channelId: "ch_1", after: 0, limit: 2 }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      items: [{ id: "m_1", seq: 1 }, { id: "m_2", seq: 2 }],
      hasMore: true,
      latestSeq: 2,
    })
    expect(mockListMessagesBySeq).toHaveBeenCalledWith(
      expect.anything(),
      { channelId: "ch_1" },
      { before: undefined, after: 0, around: undefined, limit: 2 }
    )
  })

  it("omits latestSeq from the response when the page is empty (undefined, not null/0)", async () => {
    mockListMessagesBySeq.mockResolvedValue({ items: [], hasMore: false, latestSeq: undefined })
    const res = await POST(req({ channelId: "ch_1" }, { Authorization: "Bearer crk_abc" }))
    const body = await res.json()
    expect(body).toEqual({ items: [], hasMore: false })
    expect("latestSeq" in body).toBe(false)
  })
})
