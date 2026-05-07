import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON } from "@/lib/middleware/helpers";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext();
  const db = getDb((env as Env).DB);

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 30, 1), 100) : 30;
  const before = req.nextUrl.searchParams.get("before") ?? undefined;

  if (before && isNaN(Date.parse(before))) {
    return NextResponse.json({ error: "invalid before timestamp" }, { status: 400 });
  }

  const result = await queries.inbox.listUnreadConversations(db, ctx.userId, ws.workspaceId, { limit, before });

  return writeJSON({ items: result.items, has_more: result.hasMore });
});
