import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFailStaleDispatchedTasks = vi.fn();
const mockCountRunningTasks = vi.fn();
const mockUpdateAgentStatus = vi.fn();

vi.mock("@alook/shared", () => ({
  queries: {
    task: {
      failStaleDispatchedTasks: (...args: unknown[]) => mockFailStaleDispatchedTasks(...args),
      countRunningTasks: (...args: unknown[]) => mockCountRunningTasks(...args),
    },
    agent: {
      updateAgentStatus: (...args: unknown[]) => mockUpdateAgentStatus(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { sweepStaleState } from "./sweep";

const db = {} as any;

describe("sweepStaleState", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls failStaleDispatchedTasks with workspace", async () => {
    mockFailStaleDispatchedTasks.mockResolvedValue([]);

    await sweepStaleState(db, "w1");

    expect(mockFailStaleDispatchedTasks).toHaveBeenCalledWith(db, "w1");
  });

  it("reconciles agent status for each affected agent", async () => {
    mockFailStaleDispatchedTasks.mockResolvedValue([
      { agentId: "a1", workspaceId: "w1" },
      { agentId: "a2", workspaceId: "w1" },
    ]);
    mockCountRunningTasks.mockResolvedValue(0);
    mockUpdateAgentStatus.mockResolvedValue(undefined);

    await sweepStaleState(db, "w1");

    expect(mockCountRunningTasks).toHaveBeenCalledTimes(2);
    expect(mockUpdateAgentStatus).toHaveBeenCalledTimes(2);
  });

  it("deduplicates reconcile calls by agentId:workspaceId", async () => {
    mockFailStaleDispatchedTasks.mockResolvedValue([
      { agentId: "a1", workspaceId: "w1" },
      { agentId: "a1", workspaceId: "w1" },
      { agentId: "a1", workspaceId: "w1" },
    ]);
    mockCountRunningTasks.mockResolvedValue(0);
    mockUpdateAgentStatus.mockResolvedValue(undefined);

    await sweepStaleState(db, "w1");

    expect(mockCountRunningTasks).toHaveBeenCalledTimes(1);
    expect(mockUpdateAgentStatus).toHaveBeenCalledTimes(1);
  });

  it("handles zero stale tasks gracefully", async () => {
    mockFailStaleDispatchedTasks.mockResolvedValue([]);

    await sweepStaleState(db, "w1");

    expect(mockCountRunningTasks).not.toHaveBeenCalled();
    expect(mockUpdateAgentStatus).not.toHaveBeenCalled();
  });
});
