import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/queries/task");
vi.mock("@/lib/db/queries/agent");
vi.mock("@/lib/db/queries/message");

import * as taskQueries from "@/lib/db/queries/task";
import * as agentQueries from "@/lib/db/queries/agent";
import * as messageQueries from "@/lib/db/queries/message";
import { TaskService } from "./task";

const mockTaskQueries = vi.mocked(taskQueries);
const mockAgentQueries = vi.mocked(agentQueries);
const mockMessageQueries = vi.mocked(messageQueries);

function makeService() {
  return new TaskService({} as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TaskService", () => {
  describe("enqueueTask", () => {
    it("throws when agent not found", async () => {
      mockAgentQueries.getAgent.mockResolvedValue(null as any);
      const svc = makeService();
      await expect(
        svc.enqueueTask("a1", "c1", "w1", "do stuff")
      ).rejects.toThrow("agent not found");
    });

    it("throws when agent has no runtime", async () => {
      mockAgentQueries.getAgent.mockResolvedValue({
        id: "a1",
        runtimeId: null,
        maxConcurrentTasks: 5,
      } as any);
      const svc = makeService();
      await expect(
        svc.enqueueTask("a1", "c1", "w1", "do stuff")
      ).rejects.toThrow("agent has no runtime");
    });

    it("creates task with correct params on success", async () => {
      mockAgentQueries.getAgent.mockResolvedValue({
        id: "a1",
        runtimeId: "rt1",
        maxConcurrentTasks: 5,
      } as any);
      const fakeTask = { id: "t1", agentId: "a1", runtimeId: "rt1" };
      mockTaskQueries.createTask.mockResolvedValue(fakeTask as any);

      const svc = makeService();
      const result = await svc.enqueueTask("a1", "c1", "w1", "do stuff");

      expect(result).toBe(fakeTask);
      expect(mockTaskQueries.createTask).toHaveBeenCalledWith(
        expect.anything(),
        {
          agentId: "a1",
          runtimeId: "rt1",
          workspaceId: "w1",
          conversationId: "c1",
          prompt: "do stuff",
          priority: 0,
        }
      );
    });
  });

  describe("claimTask", () => {
    it("returns null when agent not found", async () => {
      mockAgentQueries.getAgent.mockResolvedValue(null as any);
      const svc = makeService();
      expect(await svc.claimTask("a1")).toBeNull();
    });

    it("returns null when at max capacity", async () => {
      mockAgentQueries.getAgent.mockResolvedValue({
        id: "a1",
        maxConcurrentTasks: 2,
      } as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(2);

      const svc = makeService();
      expect(await svc.claimTask("a1")).toBeNull();
      expect(mockTaskQueries.claimTask).not.toHaveBeenCalled();
    });

    it("returns null when no queued tasks", async () => {
      mockAgentQueries.getAgent.mockResolvedValue({
        id: "a1",
        maxConcurrentTasks: 5,
      } as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(0);
      mockTaskQueries.claimTask.mockResolvedValue(null);

      const svc = makeService();
      expect(await svc.claimTask("a1")).toBeNull();
    });

    it("claims task and updates agent to working on success", async () => {
      mockAgentQueries.getAgent.mockResolvedValue({
        id: "a1",
        maxConcurrentTasks: 5,
      } as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(1);
      const fakeTask = { id: "t1", agentId: "a1", runtimeId: "rt1" };
      mockTaskQueries.claimTask.mockResolvedValue(fakeTask as any);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);

      const svc = makeService();
      const result = await svc.claimTask("a1");

      expect(result).toBe(fakeTask);
      expect(mockAgentQueries.updateAgentStatus).toHaveBeenCalledWith(
        expect.anything(),
        "a1",
        "working"
      );
    });
  });

  describe("claimTaskForRuntime", () => {
    it("returns null when no pending tasks", async () => {
      mockTaskQueries.listPendingTasksByRuntime.mockResolvedValue([]);
      const svc = makeService();
      expect(await svc.claimTaskForRuntime("rt1")).toBeNull();
    });

    it("deduplicates by agent ID", async () => {
      mockTaskQueries.listPendingTasksByRuntime.mockResolvedValue([
        { agentId: "a1", runtimeId: "rt1" },
        { agentId: "a1", runtimeId: "rt1" },
        { agentId: "a2", runtimeId: "rt1" },
      ] as any);

      mockAgentQueries.getAgent.mockResolvedValue(null as any);

      const svc = makeService();
      await svc.claimTaskForRuntime("rt1");

      // getAgent should only be called twice (a1 and a2), not three times
      expect(mockAgentQueries.getAgent).toHaveBeenCalledTimes(2);
    });
  });

  describe("startTask", () => {
    it("throws when not in dispatched status", async () => {
      mockTaskQueries.startTask.mockResolvedValue(null as any);
      const svc = makeService();
      await expect(svc.startTask("t1")).rejects.toThrow(
        "task not in dispatched status"
      );
    });

    it("returns started task on success", async () => {
      const fakeTask = { id: "t1", status: "running" };
      mockTaskQueries.startTask.mockResolvedValue(fakeTask as any);
      const svc = makeService();
      expect(await svc.startTask("t1")).toBe(fakeTask);
    });
  });

  describe("completeTask", () => {
    it("creates assistant message from result.output", async () => {
      const completedTask = {
        id: "t1",
        agentId: "a1",
        conversationId: "c1",
      };
      mockTaskQueries.completeTask.mockResolvedValue(completedTask as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(0);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);
      mockMessageQueries.createMessage.mockResolvedValue({} as any);

      const svc = makeService();
      const result = JSON.stringify({ output: "Task done" });
      await svc.completeTask("t1", result, "sess1", "/work");

      expect(mockMessageQueries.createMessage).toHaveBeenCalledWith(
        expect.anything(),
        {
          conversationId: "c1",
          role: "assistant",
          content: "Task done",
          taskId: "t1",
        }
      );
    });

    it("does not create message when result has no output", async () => {
      const completedTask = {
        id: "t1",
        agentId: "a1",
        conversationId: "c1",
      };
      mockTaskQueries.completeTask.mockResolvedValue(completedTask as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(0);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);

      const svc = makeService();
      await svc.completeTask("t1", JSON.stringify({ foo: "bar" }), "s1", "/w");

      expect(mockMessageQueries.createMessage).not.toHaveBeenCalled();
    });

    it("calls reconcileAgentStatus", async () => {
      const completedTask = {
        id: "t1",
        agentId: "a1",
        conversationId: "c1",
      };
      mockTaskQueries.completeTask.mockResolvedValue(completedTask as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(1);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);

      const svc = makeService();
      await svc.completeTask("t1", JSON.stringify({}), "s1", "/w");

      expect(mockAgentQueries.updateAgentStatus).toHaveBeenCalledWith(
        expect.anything(),
        "a1",
        "working"
      );
    });
  });

  describe("failTask", () => {
    it("creates error message when error is non-empty", async () => {
      const failedTask = { id: "t1", agentId: "a1", conversationId: "c1" };
      mockTaskQueries.failTask.mockResolvedValue(failedTask as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(0);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);
      mockMessageQueries.createMessage.mockResolvedValue({} as any);

      const svc = makeService();
      await svc.failTask("t1", "something broke");

      expect(mockMessageQueries.createMessage).toHaveBeenCalledWith(
        expect.anything(),
        {
          conversationId: "c1",
          role: "assistant",
          content: "Error: something broke",
          taskId: "t1",
        }
      );
    });

    it("does not create message when error is empty", async () => {
      const failedTask = { id: "t1", agentId: "a1", conversationId: "c1" };
      mockTaskQueries.failTask.mockResolvedValue(failedTask as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(0);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);

      const svc = makeService();
      await svc.failTask("t1", "");

      expect(mockMessageQueries.createMessage).not.toHaveBeenCalled();
    });

    it("calls reconcileAgentStatus", async () => {
      const failedTask = { id: "t1", agentId: "a1", conversationId: "c1" };
      mockTaskQueries.failTask.mockResolvedValue(failedTask as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(2);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);

      const svc = makeService();
      await svc.failTask("t1", "err");

      expect(mockAgentQueries.updateAgentStatus).toHaveBeenCalledWith(
        expect.anything(),
        "a1",
        "working"
      );
    });
  });

  describe("claimTask Zod validation", () => {
    it("returns properly typed camelCase object after Zod validation", async () => {
      mockAgentQueries.getAgent.mockResolvedValue({
        id: "a1",
        maxConcurrentTasks: 5,
      } as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(0);
      const fakeTask = {
        id: "t1",
        agentId: "a1",
        runtimeId: "rt1",
        workspaceId: "w1",
        conversationId: "c1",
        prompt: "do stuff",
        status: "dispatched",
        priority: 0,
        result: null,
        context: null,
        sessionId: "sess-1",
        workDir: "/tmp/work",
        createdAt: new Date("2024-01-01"),
        dispatchedAt: new Date("2024-01-01"),
        startedAt: null,
        completedAt: null,
        error: null,
      };
      mockTaskQueries.claimTask.mockResolvedValue(fakeTask as any);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);

      const svc = makeService();
      const result = await svc.claimTask("a1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("t1");
      expect(result!.runtimeId).toBe("rt1");
    });

    it("returns object with all expected fields including sessionId and workDir", async () => {
      mockAgentQueries.getAgent.mockResolvedValue({
        id: "a1",
        maxConcurrentTasks: 5,
      } as any);
      mockTaskQueries.countRunningTasks.mockResolvedValue(0);
      const fakeTask = {
        id: "t1",
        agentId: "a1",
        runtimeId: "rt1",
        workspaceId: "w1",
        conversationId: "c1",
        prompt: "do stuff",
        status: "dispatched",
        priority: 0,
        result: null,
        context: { extra: true },
        sessionId: "sess-99",
        workDir: "/work/dir",
        createdAt: new Date("2024-01-01"),
        dispatchedAt: new Date("2024-01-01"),
        startedAt: null,
        completedAt: null,
        error: null,
      };
      mockTaskQueries.claimTask.mockResolvedValue(fakeTask as any);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);

      const svc = makeService();
      const result = await svc.claimTask("a1");

      expect(result!.sessionId).toBe("sess-99");
      expect(result!.workDir).toBe("/work/dir");
      expect(result!.context).toEqual({ extra: true });
    });
  });

  describe("reconcileAgentStatus", () => {
    it("sets working when running tasks > 0", async () => {
      mockTaskQueries.countRunningTasks.mockResolvedValue(3);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);

      const svc = makeService();
      await svc.reconcileAgentStatus("a1");

      expect(mockAgentQueries.updateAgentStatus).toHaveBeenCalledWith(
        expect.anything(),
        "a1",
        "working"
      );
    });

    it("sets idle when running tasks = 0", async () => {
      mockTaskQueries.countRunningTasks.mockResolvedValue(0);
      mockAgentQueries.updateAgentStatus.mockResolvedValue(null as any);

      const svc = makeService();
      await svc.reconcileAgentStatus("a1");

      expect(mockAgentQueries.updateAgentStatus).toHaveBeenCalledWith(
        expect.anything(),
        "a1",
        "idle"
      );
    });
  });
});
