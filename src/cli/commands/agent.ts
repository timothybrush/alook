import { Command } from "commander";
import { APIClient } from "../lib/client.js";
import { loadCLIConfigForProfile, saveCLIConfigForProfile } from "../lib/config.js";
import { printTable, printJSON } from "../lib/output.js";
import { cmdPrefix } from "../lib/env.js";

interface Agent {
  id: string;
  name: string;
  runtime: string;
  status: string;
  created_at: string;
}

function resolveClientOpts(command: Command, workspaceOpt?: string) {
  const parentOpts = command.parent?.parent?.opts() || {};
  const profile: string | undefined = parentOpts.profile;
  const cfg = loadCLIConfigForProfile(profile);
  const serverUrl = parentOpts.server || cfg.server_url;

  const ws = workspaceOpt
    ? cfg.watched_workspaces?.find((w) => w.id === workspaceOpt)
    : cfg.watched_workspaces?.[0];
  const token = ws?.token;

  if (!token) {
    console.error(
      `Error: not registered. Run '${cmdPrefix()} register --token <token>' first.`,
    );
    process.exit(1);
  }

  return { serverUrl, token, cfg, profile, workspaceId: ws?.id };
}

export function agentCommand(): Command {
  const cmd = new Command("agent").description("Manage agents");

  cmd
    .command("list")
    .description("List agents")
    .option("--workspace <id>", "Workspace ID")
    .option("--json", "Output as JSON")
    .action(async (opts, command) => {
      const { serverUrl, token, workspaceId, profile } = resolveClientOpts(command, opts.workspace);
      const client = new APIClient(serverUrl, token, workspaceId);

      try {
        const queryParam = workspaceId
          ? `?workspace_id=${workspaceId}`
          : "";
        const agents = await client.getJSON<Agent[]>(
          `/api/agents${queryParam}`,
        );

        // Sync agent_ids to local config
        const profileCfg = loadCLIConfigForProfile(profile);
        const ws = profileCfg.watched_workspaces?.find((w) => w.id === workspaceId);
        if (ws) {
          ws.agent_ids = agents.map((a) => a.id);
          saveCLIConfigForProfile(profile, profileCfg);
        }

        if (opts.json) {
          printJSON(agents);
          return;
        }

        if (!agents.length) {
          console.log("No agents found.");
          return;
        }

        printTable(
          ["ID", "Name", "Runtime", "Status"],
          agents.map((a) => [a.id, a.name, a.runtime, a.status]),
        );
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : err}`,
        );
        process.exit(1);
      }
    });

  cmd
    .command("create")
    .description("Create a new agent")
    .requiredOption("--name <name>", "Agent name")
    .requiredOption("--runtime <runtime>", "Agent runtime")
    .option("--workspace <id>", "Workspace ID")
    .action(async (opts, command) => {
      const { serverUrl, token, workspaceId, profile } = resolveClientOpts(command, opts.workspace);
      const client = new APIClient(serverUrl, token, workspaceId);

      if (!opts.name) {
        console.error("Error: --name is required");
        process.exit(1);
      }
      if (!opts.runtime) {
        console.error("Error: --runtime is required");
        process.exit(1);
      }

      try {
        const agent = await client.postJSON<Agent>("/api/agents", {
          name: opts.name,
          runtime: opts.runtime,
          workspace_id: workspaceId,
        });

        // Update local config with new agent ID
        const profileCfg = loadCLIConfigForProfile(profile);
        const watched = profileCfg.watched_workspaces || [];
        const ws = watched.find((w) => w.id === workspaceId);
        if (ws) {
          if (!ws.agent_ids) ws.agent_ids = [];
          if (!ws.agent_ids.includes(agent.id)) {
            ws.agent_ids.push(agent.id);
          }
          saveCLIConfigForProfile(profile, profileCfg);
        }

        console.log(`Agent created: ${agent.name} (${agent.id})`);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : err}`,
        );
        process.exit(1);
      }
    });

  return cmd;
}
