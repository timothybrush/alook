import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/jwt");
vi.mock("@/lib/db/queries/machine-token");

import { verifyJWT, hashToken } from "@/lib/auth/jwt";
import {
  getMachineTokenByHash,
  updateMachineTokenLastUsed,
} from "@/lib/db/queries/machine-token";
import { withAuth } from "./auth";

const mockVerifyJWT = vi.mocked(verifyJWT);
const mockHashToken = vi.mocked(hashToken);
const mockGetMachineTokenByHash = vi.mocked(getMachineTokenByHash);
const mockUpdateMachineTokenLastUsed = vi.mocked(updateMachineTokenLastUsed);

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/test", { headers });
}

const handler = vi.fn(async (_req, ctx) =>
  NextResponse.json({ userId: ctx.userId, email: ctx.email, workspaceId: ctx.workspaceId }),
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withAuth", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const wrapped = withAuth(handler);
    const res = await wrapped(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("missing authorization header");
  });

  it("returns 401 when Authorization format is not Bearer", async () => {
    const wrapped = withAuth(handler);
    const res = await wrapped(makeReq({ Authorization: "Basic abc123" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid authorization format");
  });

  it("returns 401 when Authorization has no token", async () => {
    const wrapped = withAuth(handler);
    const res = await wrapped(makeReq({ Authorization: "Bearer" }));
    expect(res.status).toBe(401);
  });

  it("authenticates valid JWT and passes userId/email to handler", async () => {
    mockVerifyJWT.mockResolvedValue({ sub: "u1", email: "a@b.com", name: "" });
    const wrapped = withAuth(handler);
    const res = await wrapped(makeReq({ Authorization: "Bearer valid-jwt" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("u1");
    expect(body.email).toBe("a@b.com");
  });

  it("returns 401 for invalid/expired JWT", async () => {
    mockVerifyJWT.mockRejectedValue(new Error("expired"));
    const wrapped = withAuth(handler);
    const res = await wrapped(makeReq({ Authorization: "Bearer bad-jwt" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid token");
  });

  it("authenticates machine token (al_ prefix) via hash lookup", async () => {
    mockHashToken.mockReturnValue("hashed");
    mockGetMachineTokenByHash.mockResolvedValue({
      id: "mt1",
      userId: "u2",
      userEmail: "mt@b.com",
      workspaceId: "w1",
    } as any);
    mockUpdateMachineTokenLastUsed.mockResolvedValue(undefined as any);

    const wrapped = withAuth(handler);
    const res = await wrapped(makeReq({ Authorization: "Bearer al_test123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("u2");
    expect(body.email).toBe("mt@b.com");
    expect(body.workspaceId).toBe("w1");
  });

  it("returns 401 for unknown machine token", async () => {
    mockHashToken.mockReturnValue("hashed");
    mockGetMachineTokenByHash.mockResolvedValue(null as any);

    const wrapped = withAuth(handler);
    const res = await wrapped(makeReq({ Authorization: "Bearer al_unknown" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid token");
  });

  it("updates lastUsedAt on machine token auth", async () => {
    mockHashToken.mockReturnValue("hashed");
    mockGetMachineTokenByHash.mockResolvedValue({
      id: "mt1",
      userId: "u2",
      userEmail: "mt@b.com",
      workspaceId: "w1",
    } as any);
    mockUpdateMachineTokenLastUsed.mockResolvedValue(undefined as any);

    const wrapped = withAuth(handler);
    await wrapped(makeReq({ Authorization: "Bearer al_test" }));
    expect(mockUpdateMachineTokenLastUsed).toHaveBeenCalledWith(
      expect.anything(),
      "mt1",
    );
  });

  it("resolves dynamic params from context", async () => {
    mockVerifyJWT.mockResolvedValue({ sub: "u1", email: "a@b.com", name: "" });
    const paramHandler = vi.fn(async (_req, ctx) =>
      NextResponse.json({ taskId: ctx.params?.taskId }),
    );
    const wrapped = withAuth(paramHandler);
    const res = await wrapped(makeReq({ Authorization: "Bearer jwt" }), {
      params: Promise.resolve({ taskId: "t99" }),
    });
    const body = await res.json();
    expect(body.taskId).toBe("t99");
  });
});
