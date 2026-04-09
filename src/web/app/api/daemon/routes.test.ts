/**
 * Route-level tests verifying that each daemon endpoint rejects invalid
 * request bodies with 400 via parseBody + the correct Zod schema.
 *
 * We mock `withAuth` to bypass authentication and directly invoke handlers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Bypass auth: withAuth just calls the handler with a fake context
vi.mock("@/lib/middleware/auth", () => ({
  withAuth: (handler: any) => {
    return async (req: NextRequest, context?: any) => {
      const params = context?.params
        ? context.params instanceof Promise
          ? await context.params
          : context.params
        : undefined;
      return handler(req, { userId: "u1", email: "u@test.com", workspaceId: "w1", params });
    };
  },
}));

// Mock DB layer — we only care about request validation, not DB calls
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/queries/runtime", () => ({
  upsertAgentRuntime: vi.fn(async () => ({
    id: "rt1", workspaceId: "w1", daemonId: "d1", name: "Rt",
    runtimeMode: "local", provider: "claude", status: "online",
    deviceInfo: "", metadata: {}, lastSeenAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  })),
  setAgentRuntimeOffline: vi.fn(async () => {}),
  updateAgentRuntimeHeartbeat: vi.fn(async () => {}),
  getAgentRuntimeForWorkspace: vi.fn(async () => ({ id: "rt1" })),
  markStaleRuntimesOffline: vi.fn(async () => {}),
}));
vi.mock("@/lib/db/queries/task", () => ({
  failStaleDispatchedTasks: vi.fn(async () => []),
}));
vi.mock("@/lib/db/queries/member", () => ({
  getMemberByUserAndWorkspace: vi.fn(async () => ({ id: "m1" })),
}));
vi.mock("@/lib/db/queries/task-message", () => ({
  listTaskMessages: vi.fn(async () => []),
  createTaskMessage: vi.fn(async () => ({})),
}));
vi.mock("@/lib/services/task", () => ({
  TaskService: vi.fn().mockImplementation(() => ({
    completeTask: vi.fn(async () => ({
      id: "t1", agentId: "a1", runtimeId: "r1", conversationId: "c1",
      workspaceId: "w1", prompt: "p", status: "completed", priority: 0,
      dispatchedAt: null, startedAt: null, completedAt: null,
      result: null, error: null, createdAt: new Date(),
    })),
    failTask: vi.fn(async () => ({
      id: "t1", agentId: "a1", runtimeId: "r1", conversationId: "c1",
      workspaceId: "w1", prompt: "p", status: "failed", priority: 0,
      dispatchedAt: null, startedAt: null, completedAt: null,
      result: null, error: "err", createdAt: new Date(),
    })),
  })),
}));
vi.mock("@/lib/api/responses", () => ({
  runtimeToResponse: vi.fn((r: any) => ({ id: r.id })),
  taskToResponse: vi.fn((t: any) => ({ id: t.id, status: t.status })),
}));

function makeReq(body: unknown, url = "http://localhost/api/daemon/test"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeBadJsonReq(url = "http://localhost/api/daemon/test"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json{{{",
  });
}

// ---------------------------------------------------------------------------
// /daemon/register
// ---------------------------------------------------------------------------

describe("POST /daemon/register validation", () => {
  let POST: any;
  beforeEach(async () => {
    ({ POST } = await import("./register/route"));
  });

  it("returns 400 when workspace_id is empty", async () => {
    const res = await POST(makeReq({
      workspace_id: "",
      daemon_id: "d1",
      runtimes: [{ type: "claude" }],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when runtimes is empty array", async () => {
    const res = await POST(makeReq({
      workspace_id: "w1",
      daemon_id: "d1",
      runtimes: [],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(makeBadJsonReq());
    expect(res.status).toBe(400);
  });

  it("stores deviceInfo as device_name only, without version", async () => {
    const { upsertAgentRuntime } = await import("@/lib/db/queries/runtime");
    (upsertAgentRuntime as any).mockClear();

    const res = await POST(makeReq({
      workspace_id: "w1",
      daemon_id: "d1",
      device_name: "Gustavos-MacBook-Pro.local",
      cli_version: "0.1.0",
      runtimes: [{ type: "claude", version: "2.1.97 (Claude Code)" }],
    }));
    expect(res.status).toBe(200);
    expect(upsertAgentRuntime).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        deviceInfo: "Gustavos-MacBook-Pro.local",
      }),
    );
  });

  it("stores version in metadata, not in deviceInfo", async () => {
    const { upsertAgentRuntime } = await import("@/lib/db/queries/runtime");
    (upsertAgentRuntime as any).mockClear();

    await POST(makeReq({
      workspace_id: "w1",
      daemon_id: "d1",
      device_name: "my-host",
      cli_version: "0.1.0",
      runtimes: [{ type: "claude", version: "2.1.97 (Claude Code)" }],
    }));
    expect(upsertAgentRuntime).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        deviceInfo: "my-host",
        metadata: expect.objectContaining({
          version: "2.1.97 (Claude Code)",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// /daemon/heartbeat
// ---------------------------------------------------------------------------

describe("POST /daemon/heartbeat validation", () => {
  let POST: any;
  beforeEach(async () => {
    ({ POST } = await import("./heartbeat/route"));
  });

  it("returns 400 when runtime_id is empty string", async () => {
    const res = await POST(makeReq({ runtime_id: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when runtime_id is missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// /daemon/deregister
// ---------------------------------------------------------------------------

describe("POST /daemon/deregister validation", () => {
  let POST: any;
  beforeEach(async () => {
    ({ POST } = await import("./deregister/route"));
  });

  it("returns 400 when runtime_ids contains non-strings", async () => {
    const res = await POST(makeReq({ runtime_ids: [123, true] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(makeBadJsonReq());
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// /daemon/tasks/:taskId/complete
// ---------------------------------------------------------------------------

describe("POST /daemon/tasks/:taskId/complete validation", () => {
  let POST: any;
  beforeEach(async () => {
    ({ POST } = await import("./tasks/[taskId]/complete/route"));
  });

  it("returns 400 on malformed JSON", async () => {
    const req = makeBadJsonReq();
    const res = await POST(req, { params: Promise.resolve({ taskId: "t1" }) });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// /daemon/tasks/:taskId/fail
// ---------------------------------------------------------------------------

describe("POST /daemon/tasks/:taskId/fail validation", () => {
  let POST: any;
  beforeEach(async () => {
    ({ POST } = await import("./tasks/[taskId]/fail/route"));
  });

  it("returns 400 on malformed JSON", async () => {
    const req = makeBadJsonReq();
    const res = await POST(req, { params: Promise.resolve({ taskId: "t1" }) });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// /daemon/tasks/:taskId/messages
// ---------------------------------------------------------------------------

describe("POST /daemon/tasks/:taskId/messages validation", () => {
  let postHandler: any;
  beforeEach(async () => {
    const mod = await import("./tasks/[taskId]/messages/route");
    postHandler = mod.POST;
  });

  it("returns 400 when message item missing seq", async () => {
    const req = makeReq({ messages: [{ type: "text" }] });
    const res = await postHandler(req, { params: Promise.resolve({ taskId: "t1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when message item missing type", async () => {
    const req = makeReq({ messages: [{ seq: 1 }] });
    const res = await postHandler(req, { params: Promise.resolve({ taskId: "t1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON", async () => {
    const req = makeBadJsonReq();
    const res = await postHandler(req, { params: Promise.resolve({ taskId: "t1" }) });
    expect(res.status).toBe(400);
  });
});
