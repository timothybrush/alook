import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(async (fn: any) => fn({})),
  },
}));
vi.mock("@/lib/db/queries/verification-code");
vi.mock("@/lib/db/queries/user");
vi.mock("@/lib/db/queries/workspace");
vi.mock("@/lib/db/queries/member");
vi.mock("@/lib/auth/jwt");
vi.mock("@/lib/api/responses", () => ({
  userToResponse: vi.fn((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
  })),
}));

import {
  getLatestVerificationCode,
  markVerificationCodeUsed,
  incrementVerificationCodeAttempts,
} from "@/lib/db/queries/verification-code";
import { getUserByEmail, createUser } from "@/lib/db/queries/user";
import { listWorkspaces, createWorkspace } from "@/lib/db/queries/workspace";
import { createMember } from "@/lib/db/queries/member";
import { signJWT } from "@/lib/auth/jwt";
import { POST } from "./route";

const mockGetLatestCode = vi.mocked(getLatestVerificationCode);
const mockMarkUsed = vi.mocked(markVerificationCodeUsed);
const mockIncrementAttempts = vi.mocked(incrementVerificationCodeAttempts);
const mockGetUserByEmail = vi.mocked(getUserByEmail);
const mockCreateUser = vi.mocked(createUser);
const mockListWorkspaces = vi.mocked(listWorkspaces);
const mockCreateWorkspace = vi.mocked(createWorkspace);
const mockCreateMember = vi.mocked(createMember);
const mockSignJWT = vi.mocked(signJWT);

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/auth/verify-code"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_ENV = "development";
});

describe("POST /api/auth/verify-code", () => {
  it("returns 400 for invalid body", async () => {
    const req = new NextRequest(
      new URL("http://localhost/api/auth/verify-code"),
      {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid request body");
  });

  it("returns 400 when email or code is missing", async () => {
    const res = await POST(makeRequest({ email: "", code: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("email and code are required");
  });

  it("master code 888888 works in non-production", async () => {
    process.env.APP_ENV = "development";
    const fakeUser = {
      id: "u1",
      name: "test",
      email: "test@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockGetUserByEmail.mockResolvedValue(fakeUser as any);
    mockListWorkspaces.mockResolvedValue([{ id: "w1" }] as any);
    mockSignJWT.mockResolvedValue("jwt-token-123");

    const res = await POST(
      makeRequest({ email: "test@example.com", code: "888888" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("jwt-token-123");
    expect(body.user).toBeDefined();
    expect(mockGetLatestCode).not.toHaveBeenCalled();
  });

  it("returns 400 and increments attempts for invalid code", async () => {
    mockGetLatestCode.mockResolvedValue({
      id: "vc1",
      code: "111111",
      email: "test@example.com",
    } as any);

    const res = await POST(
      makeRequest({ email: "test@example.com", code: "999999" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid or expired code");
    expect(mockIncrementAttempts).toHaveBeenCalledWith(
      expect.anything(),
      "vc1"
    );
  });

  it("valid code marks used, creates user if needed, returns token", async () => {
    mockGetLatestCode.mockResolvedValue({
      id: "vc1",
      code: "123456",
      email: "new@example.com",
    } as any);
    mockGetUserByEmail.mockResolvedValue(null as any);
    const createdUser = {
      id: "u2",
      name: "new",
      email: "new@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCreateUser.mockResolvedValue(createdUser as any);
    mockListWorkspaces.mockResolvedValue([{ id: "w1" }] as any);
    mockSignJWT.mockResolvedValue("jwt-new-user");

    const res = await POST(
      makeRequest({ email: "new@example.com", code: "123456" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("jwt-new-user");
    expect(body.user).toBeDefined();
    expect(mockMarkUsed).toHaveBeenCalledWith(expect.anything(), "vc1");
    expect(mockCreateUser).toHaveBeenCalledWith(expect.anything(), {
      name: "new",
      email: "new@example.com",
    });
  });
});
