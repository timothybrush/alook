import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/daemon/deregister", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupMocks(opts: { workspaceId?: string } = { workspaceId: "w1" }) {
  vi.resetModules();

  vi.doMock("@/lib/middleware/auth", () => ({
    withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
      const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
      return handler(req, { userId: "u1", email: "u@t.com", workspaceId: opts.workspaceId, params });
    }),
  }));
  vi.doMock("@/lib/db", () => ({ db: {} }));
  vi.doMock("@/lib/db/queries/runtime", () => ({
    setAgentRuntimeOffline: vi.fn(async () => {}),
    getAgentRuntimeForWorkspace: vi.fn(async () => ({ id: "rt1", workspaceId: "w1" })),
  }));
}

describe("POST /api/daemon/deregister", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets owned runtimes offline", async () => {
    setupMocks();
    const { POST } = await import("./route");
    const { setAgentRuntimeOffline } = await import("@/lib/db/queries/runtime");

    const res = await POST(makeReq({ runtime_ids: ["rt1"] }));
    expect(res.status).toBe(200);
    expect(setAgentRuntimeOffline).toHaveBeenCalledWith({}, "rt1");
  });

  it("skips unowned runtimes — setAgentRuntimeOffline not called for that ID", async () => {
    setupMocks();
    const { getAgentRuntimeForWorkspace, setAgentRuntimeOffline } =
      await import("@/lib/db/queries/runtime");
    vi.mocked(getAgentRuntimeForWorkspace).mockImplementation(async (_db, id) => {
      if (id === "rt1") return { id: "rt1", workspaceId: "w1" } as any;
      return null;
    });

    const { POST } = await import("./route");
    const res = await POST(makeReq({ runtime_ids: ["rt1", "rt2"] }));
    expect(res.status).toBe(200);
    expect(setAgentRuntimeOffline).toHaveBeenCalledTimes(1);
    expect(setAgentRuntimeOffline).toHaveBeenCalledWith({}, "rt1");
  });

  it("returns 200 with empty runtime_ids (no-op)", async () => {
    setupMocks();
    const { POST } = await import("./route");
    const { setAgentRuntimeOffline } = await import("@/lib/db/queries/runtime");

    const res = await POST(makeReq({ runtime_ids: [] }));
    expect(res.status).toBe(200);
    expect(setAgentRuntimeOffline).not.toHaveBeenCalled();
  });

  it("returns 403 when called without workspaceId", async () => {
    setupMocks({ workspaceId: undefined });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ runtime_ids: ["rt1"] }));
    expect(res.status).toBe(403);
  });

  it("continues processing remaining runtimes after DB error on one", async () => {
    setupMocks();
    const { getAgentRuntimeForWorkspace, setAgentRuntimeOffline } =
      await import("@/lib/db/queries/runtime");
    vi.mocked(getAgentRuntimeForWorkspace).mockResolvedValue({ id: "rt1", workspaceId: "w1" } as any);
    vi.mocked(setAgentRuntimeOffline)
      .mockRejectedValueOnce(new Error("db error"))
      .mockResolvedValueOnce(undefined);

    const { POST } = await import("./route");
    const res = await POST(makeReq({ runtime_ids: ["rt1", "rt2"] }));
    expect(res.status).toBe(200);
    expect(setAgentRuntimeOffline).toHaveBeenCalledTimes(2);
  });
});
