import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUpdateRuntimesLastSeen = vi.fn();
const mockGetAgent = vi.fn();
const mockClaimTasksForRuntimes = vi.fn();
const mockSweepStaleState = vi.fn();
const mockBroadcastToUser = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
}));

vi.mock("@alook/shared", async () => {
  const real = await vi.importActual<typeof import("@alook/shared")>("@alook/shared");
  return {
    ...real,
    createDb: vi.fn(() => ({})),
    queries: {
      runtime: {
        updateRuntimesLastSeen: (...args: unknown[]) => mockUpdateRuntimesLastSeen(...args),
      },
      agent: {
        getAgent: (...args: unknown[]) => mockGetAgent(...args),
      },
    },
  };
});

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
    return handler(req, { userId: "u1", email: "u@t.com", workspaceId: "w1", params });
  }),
}));

vi.mock("@/lib/middleware/helpers", async () =>
  await vi.importActual<typeof import("@/lib/middleware/helpers")>("@/lib/middleware/helpers")
);

vi.mock("@/lib/services/task", () => ({
  TaskService: class {
    claimTasksForRuntimes(...args: unknown[]) { return mockClaimTasksForRuntimes(...args); }
  },
}));

vi.mock("@/lib/services/sweep", () => ({
  sweepStaleState: (...args: unknown[]) => mockSweepStaleState(...args),
}));

vi.mock("@/lib/broadcast", () => ({
  broadcastToUser: (...args: unknown[]) => mockBroadcastToUser(...args),
}));

vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api/responses", () => ({
  taskToResponse: (t: any) => ({
    id: t.id,
    agent_id: t.agentId,
    runtime_id: t.runtimeId,
    workspace_id: t.workspaceId,
    prompt: t.prompt,
    status: t.status,
  }),
}));

import { POST } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/daemon/tasks/poll", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/daemon/tasks/poll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty tasks array when no pending tasks", async () => {
    mockUpdateRuntimesLastSeen.mockResolvedValue(["r1"]);
    mockSweepStaleState.mockResolvedValue(undefined);
    mockBroadcastToUser.mockResolvedValue(undefined);
    mockClaimTasksForRuntimes.mockResolvedValue([]);

    const res = await POST(postReq({ runtime_ids: ["r1"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tasks).toEqual([]);
  });

  it("returns tasks with agent data for claimed tasks", async () => {
    mockUpdateRuntimesLastSeen.mockResolvedValue(["r1", "r2"]);
    mockSweepStaleState.mockResolvedValue(undefined);
    mockBroadcastToUser.mockResolvedValue(undefined);
    mockClaimTasksForRuntimes.mockResolvedValue([
      { id: "t1", agentId: "a1", runtimeId: "r1", workspaceId: "w1", prompt: "do it", status: "dispatched" },
    ]);
    mockGetAgent.mockResolvedValue({
      instructions: "be helpful",
      name: "Bot",
      runtimeConfig: { model: "gpt-4" },
    });

    const res = await POST(postReq({ runtime_ids: ["r1", "r2"], max_tasks: 3 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].id).toBe("t1");
    expect(body.tasks[0].agent).toEqual({
      instructions: "be helpful",
      name: "Bot",
      runtime_config: { model: "gpt-4" },
    });
  });

  it("updates last_seen_at for all runtimes", async () => {
    mockUpdateRuntimesLastSeen.mockResolvedValue(["r1", "r2"]);
    mockSweepStaleState.mockResolvedValue(undefined);
    mockBroadcastToUser.mockResolvedValue(undefined);
    mockClaimTasksForRuntimes.mockResolvedValue([]);

    await POST(postReq({ runtime_ids: ["r1", "r2"] }));

    expect(mockUpdateRuntimesLastSeen).toHaveBeenCalledWith({}, ["r1", "r2"], "w1");
  });

  it("broadcasts runtime.status only for verified runtime IDs", async () => {
    mockUpdateRuntimesLastSeen.mockResolvedValue(["r1"]); // only r1 verified
    mockSweepStaleState.mockResolvedValue(undefined);
    mockBroadcastToUser.mockResolvedValue(undefined);
    mockClaimTasksForRuntimes.mockResolvedValue([]);

    await POST(postReq({ runtime_ids: ["r1", "r2"] }));

    expect(mockBroadcastToUser).toHaveBeenCalledTimes(1);
    expect(mockBroadcastToUser).toHaveBeenCalledWith("u1", {
      type: "runtime.status",
      runtimeId: "r1",
      status: "online",
    });
  });

  it("calls sweepStaleState", async () => {
    mockUpdateRuntimesLastSeen.mockResolvedValue(["r1"]);
    mockSweepStaleState.mockResolvedValue(undefined);
    mockBroadcastToUser.mockResolvedValue(undefined);
    mockClaimTasksForRuntimes.mockResolvedValue([]);

    await POST(postReq({ runtime_ids: ["r1"] }));

    expect(mockSweepStaleState).toHaveBeenCalledWith({}, "w1");
  });

  // 403 without workspaceId is covered in routes.test.ts (cross-route validation suite)

  it("respects max_tasks parameter", async () => {
    mockUpdateRuntimesLastSeen.mockResolvedValue(["r1"]);
    mockSweepStaleState.mockResolvedValue(undefined);
    mockBroadcastToUser.mockResolvedValue(undefined);
    mockClaimTasksForRuntimes.mockResolvedValue([]);

    await POST(postReq({ runtime_ids: ["r1"], max_tasks: 5 }));

    expect(mockClaimTasksForRuntimes).toHaveBeenCalledWith(["r1"], 5, "w1");
  });

  it("defaults max_tasks to 1", async () => {
    mockUpdateRuntimesLastSeen.mockResolvedValue(["r1"]);
    mockSweepStaleState.mockResolvedValue(undefined);
    mockBroadcastToUser.mockResolvedValue(undefined);
    mockClaimTasksForRuntimes.mockResolvedValue([]);

    await POST(postReq({ runtime_ids: ["r1"] }));

    expect(mockClaimTasksForRuntimes).toHaveBeenCalledWith(["r1"], 1, "w1");
  });
});
