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

/**
 * Rules for this file:
 * - The system prompt's prose (headings, section titles, feature keywords,
 *   phrasing) changes constantly. Asserting on that content is worthless
 *   regression protection and turns every copy edit into a test-fixing chore.
 * - Only test the INPUT → OUTPUT contract: values that come in via
 *   `LaunchConfig` / `SystemPromptOpts` must round-trip verbatim into the
 *   output, and their absence must NOT leak into the output.
 * - DO NOT ADD tests that assert on specific prompt content (section headings,
 *   command names, feature strings, tone words). If you find yourself writing
 *   `expect(prompt).toContain("some english phrase")` for a phrase that isn't
 *   a value the caller passed in, stop — that test does not belong here.
 */
describe("buildCliSystemPrompt", () => {
  it("returns non-empty content for both lifecycle kinds", () => {
    expect(buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" }).length).toBeGreaterThan(0);
    expect(buildCliSystemPrompt(baseConfig, { lifecycleKind: "per_turn" }).length).toBeGreaterThan(0);
  });

  it("produces different content for persistent vs per_turn lifecycles", () => {
    const persistent = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });
    const perTurn = buildCliSystemPrompt(baseConfig, { lifecycleKind: "per_turn" });
    expect(persistent).not.toBe(perTurn);
  });

  it("round-trips agentName and agentHandle verbatim, and omits them when absent", () => {
    const withIdentity = buildCliSystemPrompt(
      { ...baseConfig, agentName: "Nova", agentHandle: "@nova#7392" },
      { lifecycleKind: "persistent" },
    );
    expect(withIdentity).toContain("Nova");
    expect(withIdentity).toContain("@nova#7392");

    const without = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });
    expect(without).not.toContain("Nova");
    expect(without).not.toContain("#7392");
  });

  it("round-trips ownerHandle verbatim, and omits it when absent", () => {
    const withOwner = buildCliSystemPrompt(
      { ...baseConfig, ownerHandle: "@gustavo#5150" },
      { lifecycleKind: "persistent" },
    );
    expect(withOwner).toContain("@gustavo#5150");

    const without = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });
    expect(without).not.toContain("#5150");
  });

  it("round-trips config.description verbatim, and omits it when absent", () => {
    const withRole = buildCliSystemPrompt(
      { ...baseConfig, description: "You are the onboarding assistant." },
      { lifecycleKind: "persistent" },
    );
    expect(withRole).toContain("You are the onboarding assistant.");

    const withoutRole = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });
    expect(withoutRole).not.toContain("You are the onboarding assistant.");
  });
});

/**
 * The `message emoji` command is a load-bearing spec: without a mention under
 * `### Messaging`, the agent doesn't know it exists, and without the pingpong
 * hint at the end of the No-politeness section it won't reach for it. These
 * are exceptions to the "don't assert prose" rule — they're wire-visible
 * command instructions that a rename would silently break.
 */
describe("buildCliSystemPrompt — message emoji instructions", () => {
  it("mentions `alook message emoji` under the Messaging command list", () => {
    const prompt = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });
    expect(prompt).toContain("alook message emoji");
  });

  it("keeps the three politeness-pingpong bullets and the silence footer", () => {
    const prompt = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });
    expect(prompt).toContain("thanks");
    expect(prompt).toContain("sounds good");
    expect(prompt).toContain("perfect");
    expect(prompt).toContain("silence, not a closing message");
  });

  it("appends the emoji-command hint and mentions both use cases (ack + close-out)", () => {
    const prompt = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });
    expect(prompt).toContain("alook message emoji --target");
    // Ack before starting a request; close-out for a done thread.
    expect(prompt.toLowerCase()).toMatch(/ack|before you (start|begin)/);
    expect(prompt.toLowerCase()).toMatch(/closing a thread|thread that.*done/);
  });

  it("does not hard-code an owner/user name in the pingpong section", () => {
    const prompt = buildCliSystemPrompt(baseConfig, { lifecycleKind: "persistent" });
    // The showcase-style `gus:` prefix from the plan (or any user's specific
    // handle) must not leak into the rendered prompt.
    expect(prompt).not.toContain("gus:");
    expect(prompt).not.toContain("gus-org");
  });
});
