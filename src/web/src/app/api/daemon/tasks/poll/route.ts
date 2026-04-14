import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, queries, PollRequestSchema } from "@alook/shared";
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, writeError, parseBody } from "@/lib/middleware/helpers";
import { taskToResponse } from "@/lib/api/responses";
import { TaskService } from "@/lib/services/task";
import { sweepStaleState } from "@/lib/services/sweep";
import { broadcastToUser } from "@/lib/broadcast";
import { log } from "@/lib/logger";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { env } = getCloudflareContext();
  const db = createDb((env as Env).DB);

  const [body, err] = await parseBody(req, PollRequestSchema);
  if (err) return err;

  if (!ctx.workspaceId) {
    return writeError("Forbidden: machine token required", 403);
  }

  // 1. Liveness: bulk-update last_seen_at for all runtime IDs
  const updatedIds = await queries.runtime.updateRuntimesLastSeen(
    db,
    body.runtime_ids,
    ctx.workspaceId
  );

  if (updatedIds.length < body.runtime_ids.length) {
    log.warn("Some runtime IDs not found in workspace", {
      expected: body.runtime_ids.length,
      updated: updatedIds.length,
    });
  }

  // Broadcast runtime status only for verified IDs
  for (const rid of updatedIds) {
    broadcastToUser(ctx.userId, {
      type: "runtime.status",
      runtimeId: rid,
      status: "online",
    }).catch(() => {});
  }

  // 2. Housekeeping: sweep stale state
  await sweepStaleState(db, ctx.workspaceId);

  // 3. Task claiming
  const taskService = new TaskService(db);
  const claimed = await taskService.claimTasksForRuntimes(
    body.runtime_ids,
    body.max_tasks,
    ctx.workspaceId!
  );

  const tasks = [];
  for (const task of claimed) {
    const agent = await queries.agent.getAgent(db, task.agentId, task.workspaceId);
    tasks.push({
      ...taskToResponse(task),
      agent: agent
        ? {
            instructions: agent.instructions,
            name: agent.name,
            runtime_config: agent.runtimeConfig || {},
          }
        : null,
    });
  }

  return writeJSON({ tasks });
});
