import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, queries } from "@alook/shared";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON, writeError } from "@/lib/middleware/helpers";
import { emailToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext();
  const db = createDb((env as Env).DB);

  const id = ctx.params?.id;
  if (!id) return writeError("email id is required", 400);

  const email = await queries.email.getEmailById(db, id, ws.workspaceId);
  if (!email) return writeError("email not found", 404);

  return writeJSON(emailToResponse(email));
});

export const DELETE = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext();
  const db = createDb((env as Env).DB);

  const id = ctx.params?.id;
  if (!id) return writeError("email id is required", 400);

  const email = await queries.email.getEmailById(db, id, ws.workspaceId);
  if (!email) return writeError("email not found", 404);

  await queries.email.deleteEmail(db, id, ws.workspaceId);

  return new Response(null, { status: 204 });
});
