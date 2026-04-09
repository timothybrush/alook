import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  updateAgentRuntimeHeartbeat,
  getAgentRuntimeForWorkspace,
  markStaleRuntimesOffline,
} from "@/lib/db/queries/runtime";
import { failStaleDispatchedTasks } from "@/lib/db/queries/task";
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, writeError, parseBody } from "@/lib/middleware/helpers";
import { HeartbeatRequestSchema } from "@alook/shared";
import { TaskService } from "@/lib/services/task";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const [body, err] = await parseBody(req, HeartbeatRequestSchema);
  if (err) return err;

  if (!ctx.workspaceId) {
    return writeError("Forbidden: machine token required", 403);
  }

  const runtime = await getAgentRuntimeForWorkspace(
    db,
    body.runtime_id,
    ctx.workspaceId
  );
  if (!runtime) {
    return writeError("Runtime not found", 404);
  }

  await updateAgentRuntimeHeartbeat(db, body.runtime_id);

  // Mark runtimes that haven't sent a heartbeat in >45s as offline
  await markStaleRuntimesOffline(db, ctx.workspaceId);

  // Fail tasks stuck in "dispatched" for >20s (daemon likely crashed)
  const stale = await failStaleDispatchedTasks(db);
  if (stale.length > 0) {
    const taskService = new TaskService(db);
    const agentIds = [...new Set(stale.map((r) => r.agentId))];
    for (const agentId of agentIds) {
      await taskService.reconcileAgentStatus(agentId);
    }
  }

  return writeJSON({ status: "ok" });
});
