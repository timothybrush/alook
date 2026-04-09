import { NextRequest, NextResponse } from "next/server";
import { verifyJWT, hashToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";

export interface AuthContext {
  userId: string;
  email: string;
  workspaceId?: string;
}

export type AuthenticatedHandler = (
  req: NextRequest,
  ctx: AuthContext & { params?: Record<string, string> }
) => Promise<NextResponse | Response>;

export function withAuth(handler: AuthenticatedHandler) {
  return async (
    req: NextRequest,
    context?: { params?: Promise<Record<string, string>> | Record<string, string> }
  ) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "missing authorization header" },
        { status: 401 }
      );
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return NextResponse.json(
        { error: "invalid authorization format" },
        { status: 401 }
      );
    }

    const token = parts[1];
    const resolvedParams = context?.params
      ? context.params instanceof Promise
        ? await context.params
        : context.params
      : undefined;

    try {
      if (token.startsWith("al_")) {
        const { getMachineTokenByHash, updateMachineTokenLastUsed } =
          await import("@/lib/db/queries/machine-token");

        const hashed = hashToken(token);
        const mt = await getMachineTokenByHash(db, hashed);
        if (!mt) {
          return NextResponse.json(
            { error: "invalid token" },
            { status: 401 }
          );
        }

        updateMachineTokenLastUsed(db, mt.id).catch(() => {});

        const authCtx: AuthContext = {
          userId: mt.userId,
          email: mt.userEmail,
          workspaceId: mt.workspaceId,
        };
        return handler(req, { ...authCtx, params: resolvedParams });
      }

      const claims = await verifyJWT(token);
      const authCtx: AuthContext = {
        userId: claims.sub,
        email: claims.email,
      };
      return handler(req, { ...authCtx, params: resolvedParams });
    } catch {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }
  };
}
