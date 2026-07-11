import { describe, it, expect, vi } from "vitest";
import * as profileQueries from "../../src/db/queries/community/user-profile";
import { communityUserProfile } from "../../src/db/community-schema";

function createSelectMock(rows: any[]) {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(rows));
  return chain;
}

function createUpsertMock(returnRow: any) {
  const chain: any = {};
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.onConflictDoUpdate = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve([returnRow]));
  return chain;
}

describe("community/user-profile exports", () => {
  it("exports getProfile + updateProfile", () => {
    expect(typeof profileQueries.getProfile).toBe("function");
    expect(typeof profileQueries.updateProfile).toBe("function");
  });
});

describe("getProfile", () => {
  it("returns the row including statusEmoji/statusText when a profile exists", async () => {
    const db = createSelectMock([
      { userId: "u_1", aboutMe: "hi", bannerColor: null, statusEmoji: "🎧", statusText: "Vibing" },
    ]);
    const result = await profileQueries.getProfile(db, "u_1");
    expect(result).toMatchObject({ statusEmoji: "🎧", statusText: "Vibing" });
  });

  it("returns null when no profile row exists", async () => {
    const db = createSelectMock([]);
    const result = await profileQueries.getProfile(db, "u_missing");
    expect(result).toBeNull();
  });
});

describe("updateProfile", () => {
  it("persists statusEmoji/statusText alongside aboutMe on insert", async () => {
    const db = createUpsertMock({
      userId: "u_1",
      aboutMe: "hi",
      bannerColor: null,
      statusEmoji: "🎧",
      statusText: "Vibing",
    });
    const result = await profileQueries.updateProfile(db, "u_1", {
      aboutMe: "hi",
      statusEmoji: "🎧",
      statusText: "Vibing",
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u_1", aboutMe: "hi", statusEmoji: "🎧", statusText: "Vibing" }),
    );
    expect(result).toMatchObject({ statusEmoji: "🎧", statusText: "Vibing" });
  });

  it("an aboutMe-only update's onConflictDoUpdate.set omits statusEmoji/statusText entirely", async () => {
    const db = createUpsertMock({ userId: "u_1", aboutMe: "hi", bannerColor: null, statusEmoji: null, statusText: "" });
    await profileQueries.updateProfile(db, "u_1", { aboutMe: "hi" });
    const conflictArg = db.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictArg.set).not.toHaveProperty("statusEmoji");
    expect(conflictArg.set).not.toHaveProperty("statusText");
    expect(conflictArg.set).toMatchObject({ aboutMe: "hi" });
    expect(conflictArg.target).toBe(communityUserProfile.userId);
  });

  it("a status-only update's onConflictDoUpdate.set omits aboutMe/bannerColor entirely", async () => {
    const db = createUpsertMock({ userId: "u_1", aboutMe: "", bannerColor: null, statusEmoji: "🎮", statusText: "Gaming" });
    await profileQueries.updateProfile(db, "u_1", { statusEmoji: "🎮", statusText: "Gaming" });
    const conflictArg = db.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictArg.set).not.toHaveProperty("aboutMe");
    expect(conflictArg.set).not.toHaveProperty("bannerColor");
    expect(conflictArg.set).toMatchObject({ statusEmoji: "🎮", statusText: "Gaming" });
  });

  it("clearing statusEmoji/statusText to null writes null through to set", async () => {
    const db = createUpsertMock({ userId: "u_1", aboutMe: "", bannerColor: null, statusEmoji: null, statusText: null });
    await profileQueries.updateProfile(db, "u_1", { statusEmoji: null, statusText: null });
    const conflictArg = db.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictArg.set).toMatchObject({ statusEmoji: null, statusText: null });
  });
});
