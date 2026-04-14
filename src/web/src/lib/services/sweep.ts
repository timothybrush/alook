import type { Database } from "@alook/shared";
import { queries } from "@alook/shared";
import { TaskService } from "./task";

/**
 * Unified workspace housekeeping. Any code path that wants to ensure
 * stale state is cleaned up just calls this one function.
 */
export async function sweepStaleState(db: Database, workspaceId: string) {
  // 1. Mark runtimes offline if no liveness update in >45s
  await queries.runtime.markStaleRuntimesOffline(db, workspaceId);

  // 2. Fail tasks stuck in "dispatched" for >20s (daemon crashed between claim and start)
  const stale = await queries.task.failStaleDispatchedTasks(db, workspaceId);

  // 3. Reconcile agent status for any agents affected by step 2
  if (stale.length > 0) {
    const taskService = new TaskService(db);
    const seen = new Set<string>();
    for (const r of stale) {
      const key = `${r.agentId}:${r.workspaceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await taskService.reconcileAgentStatus(r.agentId, r.workspaceId);
    }
  }
}
