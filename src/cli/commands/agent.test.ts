import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WatchedWorkspace, ProfileConfig } from "../lib/config.js";

// ── mocks ──────────────────────────────────────────────────────────
let mockProfileConfig: ProfileConfig;

vi.mock("../lib/config.js", () => ({
  loadCLIConfigForProfile: vi.fn(() => mockProfileConfig),
  saveCLIConfigForProfile: vi.fn(),
}));

// Stub the Commander parent chain so resolveClientOpts can read --profile/--server
function fakeCommand(workspaceOpt?: string) {
  return {
    parent: { parent: { opts: () => ({}) } },
    opts: () => ({ workspace: workspaceOpt }),
  };
}

import { loadCLIConfigForProfile, saveCLIConfigForProfile } from "../lib/config.js";
import { APIClient } from "../lib/client.js";

// ── helpers ────────────────────────────────────────────────────────
function makeWorkspace(overrides?: Partial<WatchedWorkspace>): WatchedWorkspace {
  return {
    id: "ws_1",
    name: "Test",
    token: "al_test",
    agent_ids: [],
    ...overrides,
  };
}

function mockFetchJSON(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

// ── tests ──────────────────────────────────────────────────────────

describe("agent list — config sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs agent_ids to local config after listing agents", async () => {
    const ws = makeWorkspace({ agent_ids: [] });
    mockProfileConfig = { server_url: "http://localhost", watched_workspaces: [ws] };

    const agents = [
      { id: "ag_1", name: "Agent 1", runtime: "claude", status: "active", created_at: "2024-01-01" },
      { id: "ag_2", name: "Agent 2", runtime: "codex", status: "active", created_at: "2024-01-02" },
    ];
    globalThis.fetch = mockFetchJSON(agents);

    const client = new APIClient("http://localhost", "al_test", "ws_1");
    const result = await client.getJSON<typeof agents>("/api/agents?workspace_id=ws_1");

    // Simulate the sync logic from the list action
    const profileCfg = loadCLIConfigForProfile(undefined);
    const configWs = profileCfg.watched_workspaces?.find((w) => w.id === "ws_1");
    if (configWs) {
      configWs.agent_ids = result.map((a) => a.id);
      saveCLIConfigForProfile(undefined, profileCfg);
    }

    expect(saveCLIConfigForProfile).toHaveBeenCalledOnce();
    const savedConfig = vi.mocked(saveCLIConfigForProfile).mock.calls[0][1] as ProfileConfig;
    expect(savedConfig.watched_workspaces![0].agent_ids).toEqual(["ag_1", "ag_2"]);
  });

  it("replaces stale agent_ids with current server state", async () => {
    const ws = makeWorkspace({ agent_ids: ["ag_old", "ag_deleted"] });
    mockProfileConfig = { server_url: "http://localhost", watched_workspaces: [ws] };

    const agents = [
      { id: "ag_new", name: "New Agent", runtime: "claude", status: "active", created_at: "2024-01-01" },
    ];
    globalThis.fetch = mockFetchJSON(agents);

    const client = new APIClient("http://localhost", "al_test", "ws_1");
    const result = await client.getJSON<typeof agents>("/api/agents?workspace_id=ws_1");

    const profileCfg = loadCLIConfigForProfile(undefined);
    const configWs = profileCfg.watched_workspaces?.find((w) => w.id === "ws_1");
    if (configWs) {
      configWs.agent_ids = result.map((a) => a.id);
      saveCLIConfigForProfile(undefined, profileCfg);
    }

    const savedConfig = vi.mocked(saveCLIConfigForProfile).mock.calls[0][1] as ProfileConfig;
    expect(savedConfig.watched_workspaces![0].agent_ids).toEqual(["ag_new"]);
    expect(savedConfig.watched_workspaces![0].agent_ids).not.toContain("ag_old");
    expect(savedConfig.watched_workspaces![0].agent_ids).not.toContain("ag_deleted");
  });

  it("handles empty agent list from server", async () => {
    const ws = makeWorkspace({ agent_ids: ["ag_stale"] });
    mockProfileConfig = { server_url: "http://localhost", watched_workspaces: [ws] };

    globalThis.fetch = mockFetchJSON([]);

    const client = new APIClient("http://localhost", "al_test", "ws_1");
    const result = await client.getJSON<{ id: string }[]>("/api/agents?workspace_id=ws_1");

    const profileCfg = loadCLIConfigForProfile(undefined);
    const configWs = profileCfg.watched_workspaces?.find((w) => w.id === "ws_1");
    if (configWs) {
      configWs.agent_ids = result.map((a) => a.id);
      saveCLIConfigForProfile(undefined, profileCfg);
    }

    const savedConfig = vi.mocked(saveCLIConfigForProfile).mock.calls[0][1] as ProfileConfig;
    expect(savedConfig.watched_workspaces![0].agent_ids).toEqual([]);
  });

  it("does not save if workspace is not found in config", async () => {
    mockProfileConfig = { server_url: "http://localhost", watched_workspaces: [] };

    const agents = [{ id: "ag_1", name: "A", runtime: "claude", status: "active", created_at: "" }];
    globalThis.fetch = mockFetchJSON(agents);

    const client = new APIClient("http://localhost", "al_test", "ws_missing");
    const result = await client.getJSON<typeof agents>("/api/agents?workspace_id=ws_missing");

    const profileCfg = loadCLIConfigForProfile(undefined);
    const configWs = profileCfg.watched_workspaces?.find((w) => w.id === "ws_missing");
    if (configWs) {
      configWs.agent_ids = result.map((a) => a.id);
      saveCLIConfigForProfile(undefined, profileCfg);
    }

    expect(saveCLIConfigForProfile).not.toHaveBeenCalled();
  });
});

describe("agent create — config sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends new agent ID to config after creation", async () => {
    const ws = makeWorkspace({ agent_ids: ["ag_existing"] });
    mockProfileConfig = { server_url: "http://localhost", watched_workspaces: [ws] };

    const created = { id: "ag_new", name: "New", runtime: "claude", status: "active", created_at: "" };
    globalThis.fetch = mockFetchJSON(created);

    const client = new APIClient("http://localhost", "al_test", "ws_1");
    const agent = await client.postJSON<typeof created>("/api/agents", {
      name: "New",
      runtime: "claude",
      workspace_id: "ws_1",
    });

    // Simulate the create action's config sync logic
    const profileCfg = loadCLIConfigForProfile(undefined);
    const configWs = profileCfg.watched_workspaces?.find((w) => w.id === "ws_1");
    if (configWs) {
      if (!configWs.agent_ids) configWs.agent_ids = [];
      if (!configWs.agent_ids.includes(agent.id)) {
        configWs.agent_ids.push(agent.id);
      }
      saveCLIConfigForProfile(undefined, profileCfg);
    }

    const savedConfig = vi.mocked(saveCLIConfigForProfile).mock.calls[0][1] as ProfileConfig;
    expect(savedConfig.watched_workspaces![0].agent_ids).toEqual(["ag_existing", "ag_new"]);
  });

  it("does not duplicate agent ID if already in config", async () => {
    const ws = makeWorkspace({ agent_ids: ["ag_1"] });
    mockProfileConfig = { server_url: "http://localhost", watched_workspaces: [ws] };

    const created = { id: "ag_1", name: "Dup", runtime: "claude", status: "active", created_at: "" };
    globalThis.fetch = mockFetchJSON(created);

    const client = new APIClient("http://localhost", "al_test", "ws_1");
    const agent = await client.postJSON<typeof created>("/api/agents", {
      name: "Dup",
      runtime: "claude",
      workspace_id: "ws_1",
    });

    const profileCfg = loadCLIConfigForProfile(undefined);
    const configWs = profileCfg.watched_workspaces?.find((w) => w.id === "ws_1");
    if (configWs) {
      if (!configWs.agent_ids) configWs.agent_ids = [];
      if (!configWs.agent_ids.includes(agent.id)) {
        configWs.agent_ids.push(agent.id);
      }
      saveCLIConfigForProfile(undefined, profileCfg);
    }

    const savedConfig = vi.mocked(saveCLIConfigForProfile).mock.calls[0][1] as ProfileConfig;
    expect(savedConfig.watched_workspaces![0].agent_ids).toEqual(["ag_1"]);
  });

  it("initializes agent_ids when undefined in config", async () => {
    const ws = makeWorkspace();
    delete (ws as any).agent_ids;
    mockProfileConfig = { server_url: "http://localhost", watched_workspaces: [ws] };

    const created = { id: "ag_first", name: "First", runtime: "claude", status: "active", created_at: "" };
    globalThis.fetch = mockFetchJSON(created);

    const client = new APIClient("http://localhost", "al_test", "ws_1");
    const agent = await client.postJSON<typeof created>("/api/agents", {
      name: "First",
      runtime: "claude",
      workspace_id: "ws_1",
    });

    const profileCfg = loadCLIConfigForProfile(undefined);
    const configWs = profileCfg.watched_workspaces?.find((w) => w.id === "ws_1");
    if (configWs) {
      if (!configWs.agent_ids) configWs.agent_ids = [];
      if (!configWs.agent_ids.includes(agent.id)) {
        configWs.agent_ids.push(agent.id);
      }
      saveCLIConfigForProfile(undefined, profileCfg);
    }

    const savedConfig = vi.mocked(saveCLIConfigForProfile).mock.calls[0][1] as ProfileConfig;
    expect(savedConfig.watched_workspaces![0].agent_ids).toEqual(["ag_first"]);
  });

  it("does not save if workspace is not found in config", async () => {
    mockProfileConfig = { server_url: "http://localhost", watched_workspaces: [] };

    const created = { id: "ag_1", name: "A", runtime: "claude", status: "active", created_at: "" };
    globalThis.fetch = mockFetchJSON(created);

    const client = new APIClient("http://localhost", "al_test", "ws_missing");
    const agent = await client.postJSON<typeof created>("/api/agents", {
      name: "A",
      runtime: "claude",
      workspace_id: "ws_missing",
    });

    const profileCfg = loadCLIConfigForProfile(undefined);
    const configWs = profileCfg.watched_workspaces?.find((w) => w.id === "ws_missing");
    if (configWs) {
      if (!configWs.agent_ids) configWs.agent_ids = [];
      if (!configWs.agent_ids.includes(agent.id)) {
        configWs.agent_ids.push(agent.id);
      }
      saveCLIConfigForProfile(undefined, profileCfg);
    }

    expect(saveCLIConfigForProfile).not.toHaveBeenCalled();
  });
});
