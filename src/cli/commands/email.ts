import { Command } from "commander";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import PostalMime from "postal-mime";
import { APIClient } from "../lib/client.js";
import { loadCLIConfigForProfile } from "../lib/config.js";
import { printJSON } from "../lib/output.js";
import { cmdPrefix } from "../lib/env.js";

interface EmailResponse {
  id: string;
  agent_id: string;
  from_email: string;
  to_email: string;
  subject: string;
  r2_key: string;
  is_whitelisted: boolean;
  forwarded: boolean;
  html_body: string;
  attachments: unknown[];
  status: string;
  created_at: string;
}

const VALID_STATUSES = ["unread", "read", "archived"];
const EMAIL_DIR = "/tmp/alook-emails";

function resolveClientOpts(command: Command, opts: { workspace?: string; agentId?: string }) {
  const parentOpts = command.parent?.parent?.opts() || {};
  const profile: string | undefined = parentOpts.profile;
  const cfg = loadCLIConfigForProfile(profile);
  const serverUrl = parentOpts.server || cfg.server_url;
  const workspaces = cfg.watched_workspaces || [];

  // Resolve workspace: explicit flag > lookup by agent_id > first workspace
  let ws;
  if (opts.workspace) {
    ws = workspaces.find((w) => w.id === opts.workspace);
  } else if (opts.agentId) {
    ws = workspaces.find((w) => w.agent_ids?.includes(opts.agentId!));
  }
  if (!ws) ws = workspaces[0];

  const token = ws?.token;

  if (!token) {
    console.error(
      `Error: not registered. Run '${cmdPrefix()} register --token <token>' first.`,
    );
    process.exit(1);
  }

  return { serverUrl, token, cfg, profile, workspaceId: ws?.id };
}

export function emailCommand(): Command {
  const cmd = new Command("email").description("Manage agent emails");

  cmd
    .command("pull")
    .description("Download and parse emails to /tmp/alook-emails/")
    .requiredOption("--agent_id <id>", "Agent ID")
    .option("--status <status>", "Filter by status (unread, read, archived)")
    .option("--workspace <id>", "Workspace ID")
    .option("--json", "Output as JSON instead of files")
    .action(async (opts, command) => {
      const { serverUrl, token, workspaceId } = resolveClientOpts(command, { workspace: opts.workspace, agentId: opts.agent_id });
      const client = new APIClient(serverUrl, token, workspaceId);

      if (opts.status && !VALID_STATUSES.includes(opts.status)) {
        console.error(
          `Error: invalid status "${opts.status}", must be one of: ${VALID_STATUSES.join(", ")}`,
        );
        process.exit(1);
      }

      try {
        let query = `/api/email?agentId=${opts.agent_id}`;
        if (opts.status) query += `&status=${opts.status}`;

        const emails = await client.getJSON<EmailResponse[]>(query);

        if (!emails.length) {
          console.log("No emails found.");
          return;
        }

        if (opts.json) {
          printJSON(emails);
          return;
        }

        mkdirSync(EMAIL_DIR, { recursive: true });

        const downloadedPaths: string[] = [];

        for (const email of emails) {
          const emailDir = join(EMAIL_DIR, email.id);
          mkdirSync(emailDir, { recursive: true });

          // Write metadata
          const metadata = {
            id: email.id,
            from: email.from_email,
            to: email.to_email,
            subject: email.subject,
            date: email.created_at,
            status: email.status,
          };
          const metadataPath = join(emailDir, "metadata.json");
          writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
          downloadedPaths.push(metadataPath);

          // Fetch and parse raw MIME
          let rawMime: string;
          try {
            rawMime = await client.getText(`/api/email/${email.id}/raw`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("404")) {
              console.warn(
                `Warning: email body not available for ${email.id}, skipping`,
              );
              continue;
            }
            throw err;
          }

          const parsed = await new PostalMime().parse(rawMime);

          if (parsed.text) {
            const bodyPath = join(emailDir, "body.txt");
            writeFileSync(bodyPath, parsed.text);
            downloadedPaths.push(bodyPath);
          }

          if (parsed.html) {
            const htmlPath = join(emailDir, "body.html");
            writeFileSync(htmlPath, parsed.html);
            downloadedPaths.push(htmlPath);
          }

          if (parsed.attachments && parsed.attachments.length > 0) {
            const attDir = join(emailDir, "attachments");
            mkdirSync(attDir, { recursive: true });
            const usedFilenames = new Set<string>();

            for (let i = 0; i < parsed.attachments.length; i++) {
              const att = parsed.attachments[i];
              let filename = att.filename || `attachment-${i}.bin`;
              if (usedFilenames.has(filename)) {
                filename = `${i}-${filename}`;
              }
              usedFilenames.add(filename);
              const attPath = join(attDir, filename);
              const content = att.content;
              let buf: Buffer;
              if (typeof content === "string") {
                buf = Buffer.from(content, "base64");
              } else if (content instanceof ArrayBuffer) {
                buf = Buffer.from(new Uint8Array(content));
              } else {
                buf = Buffer.from(content as Uint8Array);
              }
              writeFileSync(attPath, buf);
              downloadedPaths.push(attPath);
            }
          }
        }

        console.log(
          `Downloaded ${emails.length} email${emails.length === 1 ? "" : "s"} to ${EMAIL_DIR}/`,
        );
        for (const p of downloadedPaths) {
          console.log(`  ${p}`);
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command("set")
    .description("Update email status")
    .requiredOption("--agent_id <id>", "Agent ID")
    .requiredOption("--email_id <id>", "Email ID")
    .requiredOption("--status <status>", "New status (unread, read, archived)")
    .option("--workspace <id>", "Workspace ID")
    .action(async (opts, command) => {
      const { serverUrl, token, workspaceId } = resolveClientOpts(command, { workspace: opts.workspace, agentId: opts.agent_id });
      const client = new APIClient(serverUrl, token, workspaceId);

      if (!VALID_STATUSES.includes(opts.status)) {
        console.error(
          `Error: invalid status "${opts.status}", must be one of: ${VALID_STATUSES.join(", ")}`,
        );
        process.exit(1);
      }

      try {
        await client.patchJSON(`/api/email/${opts.email_id}`, {
          status: opts.status,
        });
        console.log(`Email ${opts.email_id} status set to ${opts.status}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  return cmd;
}
