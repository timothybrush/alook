import { describe, it, expect, vi, beforeEach } from "vitest"

const mockLogAction = vi.fn()
const mockWarn = vi.fn()

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: (...a: unknown[]) => mockWarn(...a),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    queries: {
      communityAuditLog: {
        logAction: (...a: unknown[]) => mockLogAction(...a),
      },
    },
  }
})

import { logAudit } from "./audit"

describe("logAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns void immediately without awaiting the write", () => {
    // Never resolves — asserts logAudit does not await.
    mockLogAction.mockReturnValue(new Promise(() => { }))
    const result = logAudit({} as never, {
      serverId: "s1",
      actorId: "u1",
      action: "member_kick",
      targetType: "member",
      targetId: "m1",
    })
    expect(result).toBeUndefined()
  })

  it("swallows a rejection and logs warn once with action fields", async () => {
    mockLogAction.mockRejectedValue(new Error("db offline"))
    logAudit({} as never, {
      serverId: "s1",
      actorId: "u1",
      action: "member_kick",
      targetType: "member",
      targetId: "m1",
    })
    // Give the microtask queue a chance to flush the .catch handler.
    await new Promise((r) => setTimeout(r, 0))

    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn).toHaveBeenCalledWith("audit_write_failed", {
      err: expect.stringContaining("db offline"),
      cause: "db offline",
      action: "member_kick",
      serverId: "s1",
      targetType: "member",
      targetId: "m1",
    })
  })

  it("surfaces the wrapped driver error via .cause (DrizzleQueryError shape)", async () => {
    // Mirrors drizzle-orm 0.44+: String(err) on the outer error only shows
    // "Failed query: ...", hiding the real SQLite failure on .cause.
    const outer = new Error("Failed query: insert into community_audit_log ...")
      ; (outer as Error & { cause?: unknown }).cause = new Error(
        "NOT NULL constraint failed: community_audit_log.server_id"
      )
    mockLogAction.mockRejectedValue(outer)
    logAudit({} as never, {
      serverId: null,
      actorId: "u1",
      action: "message_authored_as_bot",
      targetType: "message",
      targetId: "m1",
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(mockWarn).toHaveBeenCalledWith("audit_write_failed", {
      err: expect.stringContaining("Failed query"),
      cause: "Failed query: insert into community_audit_log ... <- NOT NULL constraint failed: community_audit_log.server_id",
      action: "message_authored_as_bot",
      serverId: null,
      targetType: "message",
      targetId: "m1",
    })
  })

  it("does not log warn on success", async () => {
    mockLogAction.mockResolvedValue(undefined)
    logAudit({} as never, {
      serverId: "s1",
      actorId: "u1",
      action: "server_update",
      targetType: "server",
      targetId: "s1",
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(mockWarn).not.toHaveBeenCalled()
  })
})
