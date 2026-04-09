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
vi.mock("@/lib/db/queries/agent");
vi.mock("@/lib/api/responses", () => ({
  agentToResponse: vi.fn((a: any) => ({ id: a.id })),
}));

import { getAgentInWorkspace, deleteAgent, updateAgent } from "@/lib/db/queries/agent";
const mockGet = vi.mocked(getAgentInWorkspace);
const mockDelete = vi.mocked(deleteAgent);
const mockUpdate = vi.mocked(updateAgent);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agents/[id]", () => {
  it("returns agent", async () => {
    mockGet.mockResolvedValue({ id: "a1" } as any);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/agents/a1?workspace_id=w1"),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    mockGet.mockResolvedValue(null as any);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/agents/a1?workspace_id=w1"),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/agents/[id]", () => {
  it("returns 204 on successful deletion", async () => {
    mockDelete.mockResolvedValue({ id: "a1" } as any);
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/agents/a1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({}, "a1", "w1");
  });

  it("returns 404 for non-existent agent", async () => {
    mockDelete.mockResolvedValue(null as any);
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/agents/nope", { method: "DELETE" }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("agent not found");
  });
});

describe("PATCH /api/agents/[id]", () => {
  it("updates agent and returns response", async () => {
    mockUpdate.mockResolvedValue({ id: "a1", name: "Updated" } as any);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/agents/a1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({}, "a1", "w1", { name: "Updated" });
  });

  it("returns 404 for non-existent agent", async () => {
    mockUpdate.mockResolvedValue(null as any);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/agents/nope", {
        method: "PATCH",
        body: JSON.stringify({ name: "X" }),
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when no fields provided", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/agents/a1", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(400);
  });
});
