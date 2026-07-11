import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const getUserPublic = vi.fn()
const getProfile = vi.fn()
const listMemberServerIds = vi.fn()

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }))

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      user: { getUserPublic: (...a: unknown[]) => getUserPublic(...a) },
      communityUserProfile: { getProfile: (...a: unknown[]) => getProfile(...a) },
      communityMember: { listMemberServerIds: (...a: unknown[]) => listMemberServerIds(...a) },
    },
  }
})

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params
    return handler(req, { env: {}, userId: "u1", email: "u@t.com", params })
  }),
}))

vi.mock("@/lib/middleware/helpers", async () => {
  const { NextResponse } = require("next/server")
  return {
    writeJSON: (data: unknown, status = 200) => NextResponse.json(data, { status }),
    writeError: (message: string, status: number) => NextResponse.json({ error: message }, { status }),
  }
})

import { GET } from "./route"

const req = new NextRequest("http://localhost/api/community/users/u2/profile")

describe("GET /api/community/users/[userId]/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserPublic.mockResolvedValue({ id: "u2", name: "Gus", discriminator: "1337", image: null })
    listMemberServerIds.mockImplementation(async (_db: unknown, userId: string) => {
      if (userId === "u1") return ["s1", "s2"]
      if (userId === "u2") return ["s2", "s3"]
      return []
    })
  })

  it("does not include email in the response payload and returns the exact expected shape, including statusEmoji/statusText from the joined profile row", async () => {
    getProfile.mockResolvedValue({ aboutMe: "hi", bannerColor: null, statusEmoji: "🎧", statusText: "Vibing" })
    const res = await GET(req, { params: { userId: "u2" } } as never)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).not.toHaveProperty("email")
    expect(body).toEqual({
      id: "u2",
      name: "Gus",
      discriminator: "1337",
      image: null,
      aboutMe: "hi",
      bannerColor: null,
      mutualServers: 1,
      statusEmoji: "🎧",
      statusText: "Vibing",
    })
  })

  it("defaults to null/\"\" when the target has no profile row (no crash)", async () => {
    getProfile.mockResolvedValue(null)
    const res = await GET(req, { params: { userId: "u2" } } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.statusEmoji).toBeNull()
    expect(body.statusText).toBe("")
  })

  it("404s when the target doesn't exist or is soft-deleted — getUserPublic excludes deleted rows unconditionally", async () => {
    getUserPublic.mockResolvedValue(null)
    const res = await GET(req, { params: { userId: "u2" } } as never)
    expect(res.status).toBe(404)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe("user not found")
  })
})
