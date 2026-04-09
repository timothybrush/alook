import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
    return handler(req, { userId: "u1", email: "u@t.com", params });
  }),
}));
vi.mock("@/lib/middleware/workspace", () => ({
  withWorkspaceMember: vi.fn(async () => ({ workspaceId: "w1" })),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/queries/runtime");
vi.mock("@/lib/api/responses", () => ({
  runtimeToResponse: vi.fn((r: any) => ({ id: r.id })),
}));

import {
  listAgentRuntimes,
  markStaleRuntimesOffline,
} from "@/lib/db/queries/runtime";
const mockList = vi.mocked(listAgentRuntimes);
const mockMarkStale = vi.mocked(markStaleRuntimesOffline);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/runtimes", () => {
  it("lists runtimes in workspace", async () => {
    mockList.mockResolvedValue([{ id: "rt1" }, { id: "rt2" }] as any);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/runtimes?workspace_id=w1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("marks stale runtimes offline before listing", async () => {
    mockList.mockResolvedValue([{ id: "rt1" }] as any);
    const { GET } = await import("./route");
    await GET(
      new NextRequest("http://localhost/api/runtimes?workspace_id=w1"),
    );
    expect(mockMarkStale).toHaveBeenCalledWith({}, "w1");
  });
});
