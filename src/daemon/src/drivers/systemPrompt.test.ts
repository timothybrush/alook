import { describe, it, expect } from "vitest";
import { buildCliSystemPrompt } from "./systemPrompt";
import type { LaunchConfig } from "../types";

const baseConfig: LaunchConfig = {
  runtimeContext: {
    agentId: "agent_7",
    serverId: "srv_3",
    computerId: "comp_1",
    computerName: "Box",
    hostname: "box.local",
    os: "darwin",
    daemonVersion: "0.61.1",
    workspacePath: "/ws",
  },
};

describe("buildCliSystemPrompt — Alook default", () => {
  const prompt = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });

  it("keeps the core sections", () => {
    expect(prompt).toContain("You are an AI agent operating in");
    expect(prompt).toContain("## CLI tool");
    expect(prompt).toContain("## Sending & receiving messages");
    expect(prompt).toContain("## Privacy & Security");
    expect(prompt).toContain("## On wake");
    expect(prompt).toContain("## Communication in Alook");
    expect(prompt).toContain("## Channel awareness");
    expect(prompt).toContain("## Workspace & Memory");
    expect(prompt).toContain("## Message Notifications");
  });

  it("does NOT bake in any other product's protocol conventions", () => {
    expect(prompt).not.toContain("RFC 5424");
    expect(prompt).not.toContain(":shortid");
    expect(prompt).not.toContain("todo → in_progress");
    expect(prompt).not.toContain("MEMORY.md");
    expect(prompt).not.toMatch(/##\s*CRITICAL RULES/);
  });

  it("no longer has the removed Additional rules / Notes / communicationGuide sections", () => {
    expect(prompt).not.toContain("## Additional rules");
    expect(prompt).not.toMatch(/##\s*Notes\b/);
  });

  it("hardcodes the alook CLI name and Alook platform label everywhere", () => {
    expect(prompt).toContain("`alook`");
    expect(prompt).toContain("You are an AI agent operating in Alook.");
  });
});

describe("buildCliSystemPrompt — lifecycle-driven notification section", () => {
  it("persistent describes busy-time inbox notices", () => {
    const p = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });
    expect(p).toContain("inbox notice");
    expect(p).toContain("inbox pull");
  });

  it("per_turn describes finishing the wake and stopping instead of polling", () => {
    const p = buildCliSystemPrompt(baseConfig, { lifecycleKind: "per_turn" });
    expect(p).toContain("once per wake");
    expect(p).not.toContain("inbox notice");
  });
});

describe("buildCliSystemPrompt — role injection", () => {
  it("includes the role when config.description is set", () => {
    const p = buildCliSystemPrompt(
      { ...baseConfig, description: "You are the onboarding assistant." },
      { lifecycleKind: "persistent" },
    );
    expect(p).toContain("## Role");
    expect(p).toContain("You are the onboarding assistant.");
  });
});
