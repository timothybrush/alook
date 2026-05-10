import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateMonsterWalkIntensity,
  clampPetPosition,
  CLOUD_CODE_MONSTER_ACTIVITIES,
  CLOUD_CODE_MONSTER_ACTIVITY_REFRESH_MS,
  CLOUD_CODE_MONSTER_AUTOWALK_ACTIVITY_IDS,
  CLOUD_CODE_MONSTER_FAINT_MIN_EVENTS,
  CLOUD_CODE_MONSTER_FAINT_MS,
  CLOUD_CODE_MONSTER_PET_PRESETS,
  createCloudCodeMonsterHiddenState,
  createCloudCodeMonsterIdleState,
  createCloudCodeMonsterWalkVelocity,
  getCloudCodeMonsterExpression,
  getCloudCodeMonsterPreset,
  getMonsterFootstepIntervalMs,
  hasViolentMonsterDirectionChange,
  isViolentMonsterDrag,
  pickCloudCodeMonsterActivity,
  reflectCloudCodeMonsterWalk,
  resolveCloudCodeMonsterPeekPosition,
  resolveCloudCodeMonsterVisibleState,
  shouldCloudCodeMonsterAutoWalk,
  shouldFaintFromMonsterShake,
  shouldRefreshCloudCodeMonsterActivity,
} from "./cloud-code-monster-pet";

function webRoot() {
  return process.cwd().endsWith(`${path.sep}src${path.sep}web`)
    ? process.cwd()
    : path.join(process.cwd(), "src/web");
}

describe("Cloud Code monster PET helpers", () => {
  it("keeps the PET inside the provided bounds", () => {
    expect(
      clampPetPosition(
        { x: -40, y: 900 },
        { width: 500, height: 400 },
        { width: 120, height: 140 },
        12
      )
    ).toEqual({ x: 12, y: 248 });
  });

  it("keeps production presets selectable and validates fallback behavior", () => {
    const presetIds = new Set(CLOUD_CODE_MONSTER_PET_PRESETS.map((preset) => preset.id));

    expect(CLOUD_CODE_MONSTER_PET_PRESETS).toHaveLength(30);
    expect(presetIds.size).toBe(30);
    expect(getCloudCodeMonsterPreset("pet-12").id).toBe("pet-12");
    expect(getCloudCodeMonsterPreset("missing").id).toBe(
      CLOUD_CODE_MONSTER_PET_PRESETS[0]!.id
    );
  });

  it("refreshes visible activity only after the away threshold", () => {
    const updatedAt = 1_000;

    expect(CLOUD_CODE_MONSTER_ACTIVITY_REFRESH_MS).toBe(3 * 60 * 1000);
    expect(
      shouldRefreshCloudCodeMonsterActivity(
        updatedAt,
        updatedAt + CLOUD_CODE_MONSTER_ACTIVITY_REFRESH_MS - 1
      )
    ).toBe(false);
    expect(
      shouldRefreshCloudCodeMonsterActivity(
        updatedAt,
        updatedAt + CLOUD_CODE_MONSTER_ACTIVITY_REFRESH_MS
      )
    ).toBe(true);

    const visible = resolveCloudCodeMonsterVisibleState(
      { activityId: "coding", updatedAt, hiddenAt: updatedAt },
      updatedAt + CLOUD_CODE_MONSTER_ACTIVITY_REFRESH_MS - 1,
      0.99
    );

    expect(visible).toEqual({
      activityId: "coding",
      updatedAt,
      hiddenAt: null,
    });
  });

  it("tracks idle, hidden, and random activity states", () => {
    expect(createCloudCodeMonsterIdleState(8_000)).toEqual({
      activityId: null,
      updatedAt: 8_000,
      hiddenAt: null,
    });
    expect(
      createCloudCodeMonsterHiddenState(
        { activityId: null, updatedAt: 1_000, hiddenAt: null },
        2_000
      )
    ).toEqual({
      activityId: null,
      updatedAt: 1_000,
      hiddenAt: 2_000,
    });
    expect(pickCloudCodeMonsterActivity(0).id).toBe(
      CLOUD_CODE_MONSTER_ACTIVITIES[0]!.id
    );
    expect(pickCloudCodeMonsterActivity(0.999).id).toBe(
      CLOUD_CODE_MONSTER_ACTIVITIES.at(-1)!.id
    );
  });

  it("limits autonomous walking to selected activities", () => {
    expect(CLOUD_CODE_MONSTER_AUTOWALK_ACTIVITY_IDS).toEqual([
      "reading",
      "phone",
      "snacking",
    ]);
    expect(shouldCloudCodeMonsterAutoWalk("reading")).toBe(true);
    expect(shouldCloudCodeMonsterAutoWalk("coding")).toBe(false);
    expect(shouldCloudCodeMonsterAutoWalk(null)).toBe(false);
  });

  it("calculates drag walking, shake, faint, and expression states", () => {
    const slowWalk = calculateMonsterWalkIntensity(4, 40);
    const fastWalk = calculateMonsterWalkIntensity(70, 16);

    expect(fastWalk).toBeGreaterThan(slowWalk);
    expect(getMonsterFootstepIntervalMs(fastWalk)).toBeLessThan(
      getMonsterFootstepIntervalMs(slowWalk)
    );
    expect(isViolentMonsterDrag(10, 40)).toBe(false);
    expect(isViolentMonsterDrag(58, 35)).toBe(true);
    expect(
      hasViolentMonsterDirectionChange({ x: 30, y: 1 }, { x: -28, y: 0 })
    ).toBe(true);
    expect(CLOUD_CODE_MONSTER_FAINT_MS).toBe(10_000);
    expect(
      shouldFaintFromMonsterShake(
        Array.from({ length: CLOUD_CODE_MONSTER_FAINT_MIN_EVENTS }, (_, index) => index * 100),
        600
      )
    ).toBe(true);
    expect(getCloudCodeMonsterExpression("sleeping", false, false)).toBe(
      "sleeping"
    );
    expect(getCloudCodeMonsterExpression("sleeping", true, false)).toBe(
      "shocked"
    );
    expect(getCloudCodeMonsterExpression("phone", true, true, true)).toBe(
      "fainted"
    );
  });

  it("creates autonomous walk velocity and reflects from canvas bounds", () => {
    expect(createCloudCodeMonsterWalkVelocity(0, 3)).toEqual({ x: 3, y: 0 });

    const rightBounce = reflectCloudCodeMonsterWalk(
      { x: 202, y: 40 },
      { x: 4, y: 1 },
      { width: 300, height: 240 },
      { width: 82, height: 82 },
      16
    );

    expect(rightBounce.reflectedX).toBe(true);
    expect(rightBounce.velocity.x).toBeLessThan(0);
    expect(rightBounce.position.x).toBeLessThanOrEqual(202);
  });

  it("resolves peeking coordinates from a real agent node before fallback coordinates", () => {
    const agentNode = {
      dataset: { agentNodeId: "ag_mandy" },
      getBoundingClientRect: () => ({
        left: 260,
        top: 360,
        width: 220,
        height: 96,
      }),
    };
    const boundary = {
      querySelectorAll: () => [agentNode],
      getBoundingClientRect: () => ({ left: 20, top: 40 }),
    } as unknown as HTMLElement;

    expect(
      resolveCloudCodeMonsterPeekPosition(
        { agentId: "ag_mandy", x: 1, y: 1 },
        boundary,
        { width: 900, height: 700 }
      )
    ).toEqual({ x: 309, y: 305.24 });
  });
});

describe("production workspace PET mounting", () => {
  it("mounts only production PET surfaces", () => {
    const root = webRoot();
    const workspaceHomePage = readFileSync(
      path.join(root, "src/app/(app)/w/[slug]/home/page.tsx"),
      "utf8"
    );
    const settingsPage = readFileSync(
      path.join(root, "src/app/(app)/w/[slug]/settings/page.tsx"),
      "utf8"
    );
    const petTab = readFileSync(
      path.join(root, "src/app/(app)/w/[slug]/settings/pet-tab.tsx"),
      "utf8"
    );
    const workspaceShell = readFileSync(
      path.join(root, "src/components/workspace-shell.tsx"),
      "utf8"
    );
    const workspacePetLayer = readFileSync(
      path.join(root, "src/components/home-pet/workspace-pet-layer.tsx"),
      "utf8"
    );
    const agentNode = readFileSync(
      path.join(root, "src/components/canvas/agent-node.tsx"),
      "utf8"
    );
    const globalCss = readFileSync(path.join(root, "src/app/globals.css"), "utf8");

    expect(workspaceHomePage).toContain("CloudCodeMonsterPet");
    expect(workspaceHomePage).toContain("useHomePetSettings");
    expect(settingsPage).toContain('{ id: "pet", label: "Pet" }');
    expect(petTab).toContain("Enable pet");
    expect(petTab).toContain("Homepage only");
    expect(petTab).toContain("Global Display");
    expect(petTab).toContain("CloudCodeMonsterPresetPreview");
    expect(workspaceShell).toContain("WorkspacePetLayer");
    expect(workspaceShell).toContain("RuntimeVersionGate");
    expect(workspacePetLayer).toContain('petSettings.displayScope !== "global"');
    expect(agentNode).toContain("data-agent-node-id={agent.id}");
    expect(agentNode).toContain('data-agent-working={activeTaskCount > 0 ? "true" : "false"}');
    expect(globalCss).toContain(".cloud-code-monster-pet");
    expect(globalCss).not.toContain(".pet-preview-flow");
  });
});
