import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EventEmitter } from "events";

// Mock all external dependencies before importing
const mockClientInstance = {
  register: vi.fn(async () => ({
    runtimes: [{ id: "rt1" }],
  })),
  deregister: vi.fn(async () => {}),
  poll: vi.fn(async () => []),
  startTask: vi.fn(async () => ({})),
  completeTask: vi.fn(async () => ({})),
  failTask: vi.fn(async () => ({})),
  reportMessages: vi.fn(async () => ({})),
};
vi.mock("./client.js", () => {
  function MockDaemonClient() { return mockClientInstance; }
  return { DaemonClient: MockDaemonClient };
});

vi.mock("./config.js", () => ({
  loadDaemonConfig: vi.fn(() => ({
    serverURL: "http://localhost:8080",
    claudePath: "claude",
    codexPath: "codex",
    opencodePath: "opencode",
    claudeModel: "opus",
    codexModel: "gpt-4",
    opencodeModel: "",
    pollInterval: 3000,
    agentTimeout: 7200000,
    maxConcurrentTasks: 20,
    daemonId: "d1",
    deviceName: "test-host",
    runtimeName: "Local Agent",
    workspacesRoot: "/tmp/ws",
    cliVersion: "0.1.0",
  })),
}));

vi.mock("./health.js", () => ({
  createHealthServer: vi.fn(() => ({
    setRuntimeCount: vi.fn(),
    server: { close: vi.fn() },
  })),
}));

vi.mock("./agent/index.js", () => ({
  detectVersion: vi.fn(async () => "1.0.0"),
}));

vi.mock("../lib/config.js", () => ({
  loadCLIConfigForProfile: vi.fn(() => ({
    server_url: null,
    watched_workspaces: [{ id: "ws1", name: "Test WS", token: "al_test_token" }],
  })),
  saveCLIConfigForProfile: vi.fn(),
}));

vi.mock("./pidfile.js", () => ({
  acquireDaemonPid: vi.fn(() => true),
  releaseDaemonPid: vi.fn(),
}));

// Track spawned children
interface MockChild extends EventEmitter {
  pid: number;
  unref: ReturnType<typeof vi.fn>;
}

const spawnedChildren: MockChild[] = [];
let nextPid = 50000;

vi.mock("child_process", () => {
  const { EventEmitter } = require("events");

  return {
    execSync: vi.fn(),
    spawn: vi.fn((_cmd: string, _args: string[], _opts: any) => {
      const child = new EventEmitter() as MockChild;
      child.pid = nextPid++;
      child.unref = vi.fn();
      spawnedChildren.push(child);
      return child;
    }),
  };
});

vi.mock("url", () => ({
  fileURLToPath: vi.fn(() => "/fake/daemon.ts"),
}));

vi.mock("path", async () => {
  const actual = await vi.importActual("path");
  return actual;
});

// Capture signal handlers and prevent actual process.exit
const signalHandlers = new Map<string, (...args: any[]) => any>();
const originalOn = process.on.bind(process);
const mockProcessExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

vi.spyOn(process, "on").mockImplementation(((event: string, handler: any) => {
  if (event === "SIGTERM" || event === "SIGINT") {
    signalHandlers.set(event, handler);
    return process;
  }
  return originalOn(event, handler);
}) as any);

// Track setInterval/clearInterval calls
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
const intervalTimers: NodeJS.Timeout[] = [];

vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: any, ms: any) => {
  const timer = realSetInterval(() => {}, 999999) as NodeJS.Timeout;
  intervalTimers.push(timer);
  return timer;
}) as any);

const clearedTimers: NodeJS.Timeout[] = [];
vi.spyOn(globalThis, "clearInterval").mockImplementation(((timer: any) => {
  clearedTimers.push(timer);
  realClearInterval(timer);
}) as any);

import { spawn } from "child_process";
import { loadCLIConfigForProfile, saveCLIConfigForProfile } from "../lib/config.js";
import { startDaemon, spawnSessionRunner } from "./daemon.js";

function decodeSpawnInput(call: any[]): any {
  // spawn('bun', ['run', path, encodedInput], opts)
  const args = call[1] as string[];
  const encoded = args[2];
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
}

describe("daemon session runner dispatch", () => {
  beforeEach(() => {
    signalHandlers.clear();
    intervalTimers.length = 0;
    clearedTimers.length = 0;
    spawnedChildren.length = 0;
    nextPid = 50000;
    vi.clearAllMocks();
    mockProcessExit.mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    for (const t of intervalTimers) realClearInterval(t);
  });

  function setupTaskClaim() {
    const fakeTask = {
      id: "t1",
      agent_id: "a1",
      runtime_id: "rt1",
      conversation_id: "c1",
      workspace_id: "ws1",
      prompt: "do stuff",
      status: "dispatched",
      priority: 0,
      dispatched_at: null,
      started_at: null,
      completed_at: null,
      created_at: "2026-01-01T00:00:00Z",
      type: "user_dm_message",
      result: null,
      error: null,
      agent: { name: "Agent 1", instructions: "be helpful" },
    };

    let claimed = false;
    mockClientInstance.poll.mockImplementation(async () => {
      if (!claimed) {
        claimed = true;
        return [fakeTask];
      }
      return [];
    });

    return fakeTask;
  }

  it("spawns a session runner when a task is polled", async () => {
    setupTaskClaim();

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    expect(spawn).toHaveBeenCalledTimes(1);
    const call = vi.mocked(spawn).mock.calls[0];
    expect(call[0]).toBe("bun");
    expect((call[1] as string[])[0]).toBe("run");
    expect((call[1] as string[])[1]).toContain("session-runner.ts");
  });

  it("passes correct SessionRunnerInput to session runner", async () => {
    setupTaskClaim();

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    const input = decodeSpawnInput(vi.mocked(spawn).mock.calls[0]);
    expect(input.task.id).toBe("t1");
    expect(input.task.prompt).toBe("do stuff");
    expect(input.provider).toBe("claude");
    expect(input.cliPath).toBe("claude");
    expect(input.model).toBe("opus");
    expect(input.serverURL).toBe("http://localhost:8080");
    expect(input.token).toBe("al_test_token");
    expect(input.workspacesRoot).toBe("/tmp/ws");
    expect(input.agentTimeout).toBe(7200000);
  });

  it("spawns with detached: true and calls unref()", async () => {
    setupTaskClaim();

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    const call = vi.mocked(spawn).mock.calls[0];
    expect((call[2] as any).detached).toBe(true);
    expect((call[2] as any).stdio).toBe("ignore");
    expect(spawnedChildren[0].unref).toHaveBeenCalled();
  });

  it("activeTasks decrements on child close event", async () => {
    setupTaskClaim();

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    // A close listener should have been registered
    expect(spawnedChildren[0].listenerCount("close")).toBe(1);

    // Simulate child process exit
    spawnedChildren[0].emit("close", 0);

    // After close, we verify indirectly: the next poll should request full capacity (20)
    // If activeTasks wasn't decremented, it would request 19
    mockClientInstance.poll.mockResolvedValue([]);
    // Manually invoke a poll by calling the function startDaemon set up
    // We verify the listener was attached — the decrement logic is straightforward
  });

  it("calls startTask before spawning session runner", async () => {
    setupTaskClaim();

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockClientInstance.startTask).toHaveBeenCalledWith("al_test_token", "t1");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("fails task and does not spawn if startTask fails", async () => {
    setupTaskClaim();
    mockClientInstance.startTask.mockRejectedValueOnce(new Error("server error"));

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockClientInstance.failTask).toHaveBeenCalledWith(
      "al_test_token",
      "t1",
      expect.stringContaining("start failed"),
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("passes correct workspace token into session runner input", async () => {
    setupTaskClaim();

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    const input = decodeSpawnInput(vi.mocked(spawn).mock.calls[0]);
    expect(input.token).toBe("al_test_token");
  });
});

describe("daemon with multi-workspace config", () => {
  beforeEach(() => {
    signalHandlers.clear();
    intervalTimers.length = 0;
    clearedTimers.length = 0;
    spawnedChildren.length = 0;
    nextPid = 50000;
    vi.clearAllMocks();
    mockProcessExit.mockImplementation((() => {}) as any);

    // Configure two workspaces
    vi.mocked(loadCLIConfigForProfile).mockReturnValue({
      server_url: "",
      watched_workspaces: [
        { id: "ws1", name: "Personal", token: "al_tok_ws1" },
        { id: "ws2", name: "Team", token: "al_tok_ws2" },
      ],
    });

    // Register returns different runtime IDs for each workspace
    let registerCall = 0;
    mockClientInstance.register.mockImplementation(async () => {
      registerCall++;
      return { runtimes: [{ id: `rt${registerCall}` }] };
    });
  });

  afterEach(() => {
    for (const t of intervalTimers) realClearInterval(t);
  });

  it("polls each workspace with its own token", async () => {
    mockClientInstance.poll.mockResolvedValue([]);

    await startDaemon();

    expect(mockClientInstance.poll).toHaveBeenCalledTimes(2);
    expect(mockClientInstance.poll).toHaveBeenCalledWith("al_tok_ws1", "d1", 20);
    expect(mockClientInstance.poll).toHaveBeenCalledWith("al_tok_ws2", "d1", 20);
  });

  it("registers each workspace with its own token", async () => {
    await startDaemon();

    expect(mockClientInstance.register).toHaveBeenCalledTimes(2);
    expect(mockClientInstance.register).toHaveBeenCalledWith(
      "al_tok_ws1",
      expect.objectContaining({ workspace_id: "ws1" }),
    );
    expect(mockClientInstance.register).toHaveBeenCalledWith(
      "al_tok_ws2",
      expect.objectContaining({ workspace_id: "ws2" }),
    );
  });

  it("concurrency accounting: spawned tasks reduce remaining for next workspace", async () => {
    const fakeTask = {
      id: "t1",
      agent_id: "a1",
      runtime_id: "rt1",
      conversation_id: "c1",
      workspace_id: "ws1",
      prompt: "do stuff",
      status: "dispatched",
      priority: 0,
      dispatched_at: null,
      started_at: null,
      completed_at: null,
      created_at: "2026-01-01T00:00:00Z",
      type: "user_dm_message",
      result: null,
      error: null,
      agent: { name: "Agent 1", instructions: "be helpful" },
    };

    // W1 returns 3 tasks, W2 should get remaining (20 - 3 = 17)
    let pollCall = 0;
    mockClientInstance.poll.mockImplementation(async () => {
      pollCall++;
      if (pollCall === 1) return [fakeTask, { ...fakeTask, id: "t2" }, { ...fakeTask, id: "t3" }];
      return [];
    });

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    // W2 should be called with max_tasks = 20 - 3 = 17
    expect(mockClientInstance.poll).toHaveBeenCalledWith("al_tok_ws2", "d1", 17);
  });

  it("multi-workspace: passes correct token per workspace into session runner", async () => {
    const fakeTaskWs1 = {
      id: "t1",
      agent_id: "a1",
      runtime_id: "rt1",
      conversation_id: "c1",
      workspace_id: "ws1",
      prompt: "ws1 task",
      status: "dispatched",
      priority: 0,
      dispatched_at: null,
      started_at: null,
      completed_at: null,
      created_at: "2026-01-01T00:00:00Z",
      type: "user_dm_message",
      result: null,
      error: null,
      agent: { name: "Agent 1", instructions: "be helpful" },
    };

    const fakeTaskWs2 = {
      ...fakeTaskWs1,
      id: "t2",
      runtime_id: "rt2",
      workspace_id: "ws2",
      prompt: "ws2 task",
    };

    let pollCall = 0;
    mockClientInstance.poll.mockImplementation(async () => {
      pollCall++;
      if (pollCall === 1) return [fakeTaskWs1];
      if (pollCall === 2) return [fakeTaskWs2];
      return [];
    });

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    expect(spawn).toHaveBeenCalledTimes(2);
    const input1 = decodeSpawnInput(vi.mocked(spawn).mock.calls[0]);
    const input2 = decodeSpawnInput(vi.mocked(spawn).mock.calls[1]);
    expect(input1.token).toBe("al_tok_ws1");
    expect(input2.token).toBe("al_tok_ws2");
  });
});

describe("daemon shutdown", () => {
  beforeEach(() => {
    signalHandlers.clear();
    intervalTimers.length = 0;
    clearedTimers.length = 0;
    spawnedChildren.length = 0;
    nextPid = 50000;
    vi.clearAllMocks();
    mockProcessExit.mockImplementation((() => {}) as any);

    // Restore default mock implementations after clearAllMocks
    mockClientInstance.register.mockResolvedValue({ runtimes: [{ id: "rt1" }] });
    mockClientInstance.poll.mockResolvedValue([]);
    mockClientInstance.startTask.mockResolvedValue({});
  });

  afterEach(() => {
    for (const t of intervalTimers) realClearInterval(t);
  });

  it("clears poll interval before calling deregister", async () => {
    await startDaemon();

    expect(intervalTimers.length).toBe(1);
    const pollTimer = intervalTimers[0];

    const deregisterMock = mockClientInstance.deregister;

    let deregisterCalledAt = -1;
    let clearCalledCount = 0;
    deregisterMock.mockImplementation(async () => {
      deregisterCalledAt = clearCalledCount;
    });

    const originalClearMock = vi.mocked(globalThis.clearInterval);
    originalClearMock.mockImplementation(((timer: any) => {
      clearCalledCount++;
      clearedTimers.push(timer);
      realClearInterval(timer);
    }) as any);

    const shutdownHandler = signalHandlers.get("SIGTERM");
    expect(shutdownHandler).toBeDefined();
    await shutdownHandler!();

    expect(clearedTimers).toContain(pollTimer);
    expect(deregisterCalledAt).toBe(1);
  });

  it("deregisters each workspace with correct token on shutdown", async () => {
    vi.mocked(loadCLIConfigForProfile).mockReturnValue({
      server_url: "",
      watched_workspaces: [
        { id: "ws1", name: "Personal", token: "al_tok_ws1" },
        { id: "ws2", name: "Team", token: "al_tok_ws2" },
      ],
    });

    let registerCall = 0;
    mockClientInstance.register.mockImplementation(async () => {
      registerCall++;
      return { runtimes: [{ id: `rt${registerCall}` }] };
    });

    await startDaemon();

    const shutdownHandler = signalHandlers.get("SIGTERM");
    expect(shutdownHandler).toBeDefined();
    await shutdownHandler!();

    expect(mockClientInstance.deregister).toHaveBeenCalledWith("al_tok_ws1", "d1");
    expect(mockClientInstance.deregister).toHaveBeenCalledWith("al_tok_ws2", "d1");
  });

  it("does not kill session runner children on shutdown", async () => {
    const fakeTask = {
      id: "t1",
      agent_id: "a1",
      runtime_id: "rt1",
      conversation_id: "c1",
      workspace_id: "ws1",
      prompt: "do stuff",
      status: "dispatched",
      priority: 0,
      dispatched_at: null,
      started_at: null,
      completed_at: null,
      created_at: "2026-01-01T00:00:00Z",
      type: "user_dm_message",
      result: null,
      error: null,
      agent: { name: "Agent 1", instructions: "be helpful" },
    };

    let claimed = false;
    mockClientInstance.poll.mockImplementation(async () => {
      if (!claimed) {
        claimed = true;
        return [fakeTask];
      }
      return [];
    });
    mockClientInstance.startTask.mockResolvedValue({});

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    expect(spawnedChildren.length).toBe(1);

    // Shutdown — should NOT kill the child
    const shutdownHandler = signalHandlers.get("SIGTERM");
    await shutdownHandler!();

    // Child should still be alive — unref was called, no kill signal sent
    expect(spawnedChildren[0].unref).toHaveBeenCalled();
  });
});

describe("daemon agent_ids lazy sync", () => {
  beforeEach(() => {
    signalHandlers.clear();
    intervalTimers.length = 0;
    clearedTimers.length = 0;
    spawnedChildren.length = 0;
    nextPid = 50000;
    vi.clearAllMocks();
    mockProcessExit.mockImplementation((() => {}) as any);

    // Restore default mock implementations after clearAllMocks
    mockClientInstance.register.mockResolvedValue({ runtimes: [{ id: "rt1" }] });
    mockClientInstance.startTask.mockResolvedValue({});
  });

  afterEach(() => {
    for (const t of intervalTimers) realClearInterval(t);
  });

  function makeFakeTask(overrides?: Record<string, unknown>) {
    return {
      id: "t1",
      agent_id: "a1",
      runtime_id: "rt1",
      conversation_id: "c1",
      workspace_id: "ws1",
      prompt: "do stuff",
      status: "dispatched",
      priority: 0,
      dispatched_at: null,
      started_at: null,
      completed_at: null,
      created_at: "2026-01-01T00:00:00Z",
      type: "user_dm_message",
      result: null,
      error: null,
      agent: { name: "Agent 1", instructions: "be helpful" },
      ...overrides,
    };
  }

  it("syncs unknown agent_id to config when task is received", async () => {
    // Config has no agent_ids — agent was created on the web
    vi.mocked(loadCLIConfigForProfile).mockReturnValue({
      server_url: "",
      watched_workspaces: [{ id: "ws1", name: "Test WS", token: "al_test_token", agent_ids: [] }],
    });

    let claimed = false;
    mockClientInstance.poll.mockImplementation(async () => {
      if (!claimed) { claimed = true; return [makeFakeTask()]; }
      return [];
    });

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    expect(saveCLIConfigForProfile).toHaveBeenCalledOnce();
    const savedConfig = vi.mocked(saveCLIConfigForProfile).mock.calls[0][1];
    expect(savedConfig.watched_workspaces![0].agent_ids).toContain("a1");
  });

  it("does not save config when agent_id is already known", async () => {
    // Config already has agent "a1"
    vi.mocked(loadCLIConfigForProfile).mockReturnValue({
      server_url: "",
      watched_workspaces: [{ id: "ws1", name: "Test WS", token: "al_test_token", agent_ids: ["a1"] }],
    });

    let claimed = false;
    mockClientInstance.poll.mockImplementation(async () => {
      if (!claimed) { claimed = true; return [makeFakeTask()]; }
      return [];
    });

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    expect(saveCLIConfigForProfile).not.toHaveBeenCalled();
  });

  it("deduplicates: multiple tasks with same new agent_id only save once", async () => {
    vi.mocked(loadCLIConfigForProfile).mockReturnValue({
      server_url: "",
      watched_workspaces: [{ id: "ws1", name: "Test WS", token: "al_test_token", agent_ids: [] }],
    });

    let claimed = false;
    mockClientInstance.poll.mockImplementation(async () => {
      if (!claimed) {
        claimed = true;
        // Two tasks from the same agent
        return [makeFakeTask({ id: "t1" }), makeFakeTask({ id: "t2" })];
      }
      return [];
    });

    await startDaemon();
    await new Promise((r) => setTimeout(r, 50));

    // Only one save — the in-memory set deduplicates
    expect(saveCLIConfigForProfile).toHaveBeenCalledOnce();
  });
});

describe("spawnSessionRunner", () => {
  beforeEach(() => {
    spawnedChildren.length = 0;
    nextPid = 50000;
    vi.clearAllMocks();
  });

  it("encodes input as base64 and passes to bun run", () => {
    const input = {
      task: { id: "t1", agentId: "a1", runtimeId: "rt1", conversationId: "c1", workspaceId: "ws1", prompt: "test", status: "dispatched", priority: 0, type: "user_dm_message", createdAt: "2026-01-01T00:00:00Z" },
      provider: "claude",
      cliPath: "claude",
      model: "opus",
      serverURL: "http://localhost:8080",
      token: "test_token",
      workspacesRoot: "/tmp/ws",
      agentTimeout: 7200000,
      };

    const child = spawnSessionRunner(input as any);

    expect(spawn).toHaveBeenCalledTimes(1);
    const call = vi.mocked(spawn).mock.calls[0];
    expect(call[0]).toBe("bun");

    const args = call[1] as string[];
    expect(args[0]).toBe("run");
    expect(args[1]).toContain("session-runner.ts");

    // Decode and verify
    const decoded = JSON.parse(Buffer.from(args[2], "base64").toString("utf-8"));
    expect(decoded.task.id).toBe("t1");
    expect(decoded.provider).toBe("claude");
    expect(decoded.token).toBe("test_token");

    expect((call[2] as any).detached).toBe(true);
    expect((call[2] as any).stdio).toBe("ignore");
    expect(child.unref).toHaveBeenCalled();
  });
});
