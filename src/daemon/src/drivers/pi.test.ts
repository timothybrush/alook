import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PiDriver } from "./pi";
import { CANONICAL_FILE, SYMLINK_ALIASES } from "./agentFile";
import type { LaunchContext } from "../types";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-driver-test-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function baseCtx(overrides: Partial<LaunchContext> = {}): LaunchContext {
  return {
    agentId: "agent_1",
    workingDirectory: tmpDir,
    standingPrompt: "You are Pi.",
    prompt: "hello",
    config: {},
    credentialProxy: {} as LaunchContext["credentialProxy"],
    ...overrides,
  };
}

function fakeDeps() {
  const session = {
    prompt: vi.fn().mockResolvedValue(undefined),
    steer: vi.fn(),
    abort: vi.fn(),
    dispose: vi.fn(),
    isStreaming: false,
    subscribe: vi.fn(),
  };
  const createAgentSession = vi.fn().mockResolvedValue({ session, sessionId: "sess_1" });
  const buildSpawnEnv = vi.fn().mockResolvedValue({});
  return { buildSpawnEnv, createAgentSession, session };
}

describe("PiDriver.createSession — AGENTS.md packing", () => {
  it("writes AGENTS.md into the workdir instead of passing standingPrompt to the SDK", async () => {
    const driver = new PiDriver();
    const deps = fakeDeps();

    await driver.createSession(baseCtx(), deps);

    expect(fs.readFileSync(path.join(tmpDir, CANONICAL_FILE), "utf-8")).toBe("You are Pi.");
    expect(fs.lstatSync(path.join(tmpDir, SYMLINK_ALIASES[0])).isSymbolicLink()).toBe(true);

    const sessionOpts = deps.createAgentSession.mock.calls[0][0];
    expect(sessionOpts).not.toHaveProperty("standingPrompt");
  });

  it("does not rewrite AGENTS.md when the standing prompt is unchanged (hash dedup)", async () => {
    const driver = new PiDriver();
    await driver.createSession(baseCtx(), fakeDeps());
    const firstMtime = fs.statSync(path.join(tmpDir, CANONICAL_FILE)).mtimeMs;

    // Second session, identical standingPrompt — file content must be untouched.
    await new Promise((r) => setTimeout(r, 5));
    await driver.createSession(baseCtx(), fakeDeps());
    const secondMtime = fs.statSync(path.join(tmpDir, CANONICAL_FILE)).mtimeMs;

    expect(secondMtime).toBe(firstMtime);
  });

  it("skips the write when standingPrompt is empty", async () => {
    const driver = new PiDriver();
    await driver.createSession(baseCtx({ standingPrompt: "" }), fakeDeps());
    expect(fs.existsSync(path.join(tmpDir, CANONICAL_FILE))).toBe(false);
  });
});
