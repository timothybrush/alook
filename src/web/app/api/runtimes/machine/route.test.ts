import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDeleteRuntimes = vi.fn(async () => {});
const mockGetMember = vi.fn(async () => ({ id: "m1" }));

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: (handler: any) => {
    return async (req: NextRequest, context?: any) => {
      const params = context?.params
        ? context.params instanceof Promise
          ? await context.params
          : context.params
        : undefined;
      return handler(req, { userId: "u1", email: "u@test.com", params });
    };
  },
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/queries/runtime", () => ({
  deleteRuntimesByDaemonId: (...args: Parameters<typeof mockDeleteRuntimes>) => mockDeleteRuntimes(...args),
}));
vi.mock("@/lib/db/queries/member", () => ({
  getMemberByUserAndWorkspace: (...args: Parameters<typeof mockGetMember>) => mockGetMember(...args),
}));

describe("DELETE /api/runtimes/machine", () => {
  let DELETE: any;
  beforeEach(async () => {
    mockDeleteRuntimes.mockClear();
    mockGetMember.mockClear();
    mockGetMember.mockResolvedValue({ id: "m1" });
    mockDeleteRuntimes.mockResolvedValue(undefined);
    ({ DELETE } = await import("./route"));
  });

  it("returns 400 when daemon_id is missing", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/runtimes/machine?workspace_id=w1", {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("daemon_id is required");
  });

  it("returns 400 when workspace_id is missing", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/runtimes/machine?daemon_id=d1", {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when user is not a workspace member", async () => {
    mockGetMember.mockResolvedValueOnce(null as any);
    const res = await DELETE(
      new NextRequest(
        "http://localhost/api/runtimes/machine?workspace_id=w1&daemon_id=d1",
        { method: "DELETE" }
      )
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful delete", async () => {
    const res = await DELETE(
      new NextRequest(
        "http://localhost/api/runtimes/machine?workspace_id=w1&daemon_id=d1",
        { method: "DELETE" }
      )
    );
    expect(res.status).toBe(204);
    expect(mockDeleteRuntimes).toHaveBeenCalledWith({}, "d1", "w1");
  });

  it("passes correct daemon_id with dots and dashes", async () => {
    const res = await DELETE(
      new NextRequest(
        "http://localhost/api/runtimes/machine?workspace_id=w1&daemon_id=My-MacBook-Pro.local",
        { method: "DELETE" }
      )
    );
    expect(res.status).toBe(204);
    expect(mockDeleteRuntimes).toHaveBeenCalledWith(
      {},
      "My-MacBook-Pro.local",
      "w1"
    );
  });

  it("calls deleteRuntimesByDaemonId exactly once", async () => {
    await DELETE(
      new NextRequest(
        "http://localhost/api/runtimes/machine?workspace_id=w1&daemon_id=d1",
        { method: "DELETE" }
      )
    );
    expect(mockDeleteRuntimes).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when deleteRuntimesByDaemonId throws", async () => {
    mockDeleteRuntimes.mockRejectedValueOnce(new Error("FK violation"));
    const res = await DELETE(
      new NextRequest(
        "http://localhost/api/runtimes/machine?workspace_id=w1&daemon_id=d1",
        { method: "DELETE" }
      )
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to remove machine");
  });
});
