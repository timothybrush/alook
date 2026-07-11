import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const listFriends = vi.fn()
const listMemberUserIds = vi.fn()
const getMember = vi.fn()

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }))

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      communityFriendship: { listFriends: (...a: unknown[]) => listFriends(...a) },
      communityMember: {
        listMemberUserIds: (...a: unknown[]) => listMemberUserIds(...a),
        getMember: (...a: unknown[]) => getMember(...a),
      },
    },
  }
})

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params
    return handler(req, { env: {}, userId: "u1", email: "u@t.com", params })
  }),
}))

vi.mock("@/lib/middleware/helpers", () => {
  const { NextResponse } = require("next/server")
  return {
    writeJSON: (data: unknown, status = 200) => NextResponse.json(data, { status }),
    writeError: (message: string, status: number) => NextResponse.json({ error: message }, { status }),
  }
})

import { GET } from "./route"

const ctx = { params: { id: "s1" } } as any
const req = new NextRequest("http://localhost/api/community/servers/s1/invitable-friends")

describe("GET /api/community/servers/[id]/invitable-friends", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMember.mockResolvedValue({ id: "mem_1", userId: "u1", role: "member" })
    listMemberUserIds.mockResolvedValue([])
  })

  it("includes statusEmoji/statusText sourced from the joined profile row, same as friends-page.tsx", async () => {
    listFriends.mockResolvedValue([
      { id: "f1", friendUserId: "u2", friendName: "Gus", friendDiscriminator: "1337", friendImage: null, statusEmoji: "🎮", statusText: "Gaming" },
    ])
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as { friends: Array<{ statusEmoji: string | null; statusText: string }> }
    expect(body.friends[0]).toMatchObject({ statusEmoji: "🎮", statusText: "Gaming" })
  })

  it("defaults statusEmoji/statusText for a friend with no profile row", async () => {
    listFriends.mockResolvedValue([
      { id: "f2", friendUserId: "u3", friendName: "Lindsay", friendDiscriminator: "0007", friendImage: null, statusEmoji: null, statusText: null },
    ])
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as { friends: Array<{ statusEmoji: string | null; statusText: string }> }
    expect(body.friends[0]).toMatchObject({ statusEmoji: null, statusText: "" })
  })

  it("still excludes friends who are already members of the server", async () => {
    listFriends.mockResolvedValue([
      { id: "f1", friendUserId: "u2", friendName: "Gus", friendDiscriminator: "1337", friendImage: null, statusEmoji: null, statusText: null },
    ])
    listMemberUserIds.mockResolvedValue(["u2"])
    const res = await GET(req, ctx)
    const body = await res.json() as { friends: unknown[] }
    expect(body.friends).toHaveLength(0)
  })
})
