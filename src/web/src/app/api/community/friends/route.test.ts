import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const listFriends = vi.fn()
const listBlocked = vi.fn()

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }))

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      communityFriendship: {
        listFriends: (...a: unknown[]) => listFriends(...a),
        listBlocked: (...a: unknown[]) => listBlocked(...a),
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
  }
})

import { GET } from "./route"

const req = new NextRequest("http://localhost/api/community/friends")

describe("GET /api/community/friends", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listBlocked.mockResolvedValue([])
  })

  it("includes statusEmoji/statusText sourced from the joined profile row", async () => {
    listFriends.mockResolvedValue([
      { id: "f1", friendUserId: "u2", friendName: "Gus", friendDiscriminator: "1337", friendImage: null, statusEmoji: "🎧", statusText: "Vibing" },
    ])
    const res = await GET(req, {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { friends: Array<{ statusEmoji: string | null; statusText: string }> }
    expect(body.friends[0]).toMatchObject({ statusEmoji: "🎧", statusText: "Vibing" })
  })

  it("defaults statusEmoji/statusText for a friend with no profile row (no crash on the leftJoin)", async () => {
    listFriends.mockResolvedValue([
      { id: "f2", friendUserId: "u3", friendName: "Lindsay", friendDiscriminator: "0007", friendImage: null, statusEmoji: null, statusText: null },
    ])
    const res = await GET(req, {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { friends: Array<{ statusEmoji: string | null; statusText: string }> }
    expect(body.friends[0]).toMatchObject({ statusEmoji: null, statusText: "" })
  })
})
