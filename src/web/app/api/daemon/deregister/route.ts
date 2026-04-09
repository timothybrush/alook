import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  setAgentRuntimeOffline,
  getAgentRuntimeForWorkspace,
} from "@/lib/db/queries/runtime";
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, writeError, parseBody } from "@/lib/middleware/helpers";
import { DeregisterRequestSchema } from "@alook/shared";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const [body, err] = await parseBody(req, DeregisterRequestSchema);
  if (err) return err;

  if (!ctx.workspaceId) {
    return writeError("Forbidden: machine token required", 403);
  }

  for (const id of body.runtime_ids) {
    const runtime = await getAgentRuntimeForWorkspace(
      db,
      id,
      ctx.workspaceId
    );
    if (!runtime) continue;

    try {
      await setAgentRuntimeOffline(db, id);
    } catch (e) {
      console.warn(`failed to set runtime ${id} offline:`, e);
    }
  }

  return writeJSON({ status: "ok" });
});
