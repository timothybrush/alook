import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, queries, PollRequestSchema } from "@alook/shared";
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, writeError, parseBody } from "@/lib/middleware/helpers";
import { taskToResponse } from "@/lib/api/responses";
import { TaskService } from "@/lib/services/task";
import { sweepStaleState } from "@/lib/services/sweep";
import { broadcastToUser } from "@/lib/broadcast";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { env } = getCloudflareContext();
  const db = createDb((env as Env).DB);

  const [body, err] = await parseBody(req, PollRequestSchema);
  if (err) return err;

  if (!ctx.workspaceId) {
    return writeError("Forbidden: machine token required", 403);
  }

  // 1. Resolve runtime IDs from daemon_id + workspaceId
  const runtimeIds = await queries.runtime.getRuntimeIdsByDaemon(
    db,
    body.daemon_id,
    ctx.workspaceId,
  );

  if (runtimeIds.length === 0) {
    return writeJSON({ tasks: [] });
  }

  // 2. Liveness: update machine last_seen_at (1 row write instead of N)
  await queries.machine.updateMachineLastSeen(
    db,
    body.daemon_id,
    ctx.workspaceId,
  );

  // Single broadcast at daemon level
  broadcastToUser(ctx.userId, {
    type: "runtime.status",
    daemonId: body.daemon_id,
    workspaceId: ctx.workspaceId,
    status: "online",
  }).catch(() => {});

  // 3. Housekeeping: sweep stale state
  await sweepStaleState(db, ctx.workspaceId);

  // 4. Task claiming
  const taskService = new TaskService(db);
  const claimed = await taskService.claimTasksForRuntimes(
    runtimeIds,
    body.max_tasks,
    ctx.workspaceId!,
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
