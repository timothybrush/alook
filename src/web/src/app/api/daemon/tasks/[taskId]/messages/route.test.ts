import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockListTaskMessages = vi.fn();
const mockCreateTaskMessage = vi.fn();
const mockGetTask = vi.fn();
const mockTaskMessageToResponse = vi.fn((m: any) => m);

let mockAuthCtx: Record<string, unknown> = { userId: "u1", email: "u@t.com", workspaceId: "w1" };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: { withSession: () => ({}) } } })),
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@alook/shared", async () => {
  const real = await vi.importActual<typeof import("@alook/shared")>("@alook/shared");
  return {
    ...real,
    createDb: vi.fn(() => ({})),
    queries: {
      taskMessage: {
        listTaskMessages: (...args: any[]) => mockListTaskMessages(...args),
        createTaskMessage: (...args: any[]) => mockCreateTaskMessage(...args),
      },
      task: {
        getTask: (...args: any[]) => mockGetTask(...args),
      },
    },
  };
});
vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params =
      ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
    return handler(req, { ...mockAuthCtx, params });
  }),
}));
vi.mock("@/lib/middleware/helpers", async () => {
  return await vi.importActual<typeof import("@/lib/middleware/helpers")>(
    "@/lib/middleware/helpers"
  );
});
vi.mock("@/lib/api/responses", () => ({
  taskMessageToResponse: (...args: any[]) => mockTaskMessageToResponse(...args),
}));
vi.mock("@/lib/broadcast", () => ({
  broadcastToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "./route";

const withParams = (taskId: string) => ({
  params: Promise.resolve({ taskId }),
});

describe("GET /api/daemon/tasks/[taskId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthCtx = { userId: "u1", email: "u@t.com", workspaceId: "w1" };
  });

  it("returns messages for workspace-scoped task", async () => {
    const msgs = [{ id: "m1", seq: 1, content: "hi" }];
    mockListTaskMessages.mockResolvedValue(msgs);

    const res = await GET(
      new NextRequest("http://localhost/api/daemon/tasks/t1/messages"),
      withParams("t1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(mockListTaskMessages).toHaveBeenCalledWith({}, "t1", "w1");
  });

  it("returns 403 when workspaceId is missing (session auth)", async () => {
    mockAuthCtx = { userId: "u1", email: "u@t.com" };

    const res = await GET(
      new NextRequest("http://localhost/api/daemon/tasks/t1/messages"),
      withParams("t1")
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden: machine token required");
    expect(mockListTaskMessages).not.toHaveBeenCalled();
  });
});

describe("POST /api/daemon/tasks/[taskId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthCtx = { userId: "u1", email: "u@t.com", workspaceId: "w1" };
  });

  it("creates messages for workspace-scoped task", async () => {
    mockGetTask.mockResolvedValue({ id: "t1", workspaceId: "w1" });
    mockCreateTaskMessage.mockResolvedValue({ id: "m1" });

    const res = await POST(
      new NextRequest("http://localhost/api/daemon/tasks/t1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ seq: 1, type: "text", content: "hello" }],
        }),
      }),
      withParams("t1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(mockGetTask).toHaveBeenCalledWith({}, "t1", "w1");
  });

  it("returns 403 when workspaceId is missing (session auth)", async () => {
    mockAuthCtx = { userId: "u1", email: "u@t.com" };

    const res = await POST(
      new NextRequest("http://localhost/api/daemon/tasks/t1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ seq: 1, type: "text", content: "hello" }],
        }),
      }),
      withParams("t1")
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden: machine token required");
    expect(mockGetTask).not.toHaveBeenCalled();
  });

  it("returns 404 when task belongs to another workspace", async () => {
    mockGetTask.mockResolvedValue(null);

    const res = await POST(
      new NextRequest("http://localhost/api/daemon/tasks/t-other/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ seq: 1, type: "text", content: "hello" }],
        }),
      }),
      withParams("t-other")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("task not found");
    expect(mockCreateTaskMessage).not.toHaveBeenCalled();
  });
});
