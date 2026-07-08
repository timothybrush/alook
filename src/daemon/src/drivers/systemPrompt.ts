/**
 * Shared system-prompt builder.
 *
 * Every CLI driver's `buildSystemPrompt` funnels through here. The prompt is
 * assembled from a fixed sequence of sections:
 *   1. Identity line
 *   2. CLI tool description
 *   3. Sending & receiving messages
 *   4. Channel refs & message format
 *   5. Credential hygiene
 *   6. Startup sequence
 *   7. Communication style & etiquette
 *   8. Channel awareness
 *   9. Workspace & Memory
 *   10. Message notifications (auto-generated from `lifecycleKind`)
 *   11. Role (from `config.description`, when set)
 *
 * Alook is the product — there's no other host to be neutral toward, so the
 * CLI name (`alook`) and platform label (`Alook`) are hardcoded, not
 * configurable options.
 *
 * ONE generation path, not nine: every driver passes only `lifecycleKind`
 * (`"persistent" | "per_turn"`, taken straight from `driver.lifecycle.kind`)
 * — there is no per-driver hand-typed reminder text. Section 10 is derived
 * entirely from that one value, so every driver of the same lifecycle kind
 * gets identical, complete notification/reminder guidance with zero
 * duplication or drift between drivers.
 */
import type { LaunchConfig } from "../types.js";

const CLI = "alook";

export interface SystemPromptOpts {
  /**
   * Drives the auto-generated `## Message Notifications` section: whether
   * this runtime's process stays alive across turns (`"persistent"`) or
   * handles exactly one turn and exits (`"per_turn"`). Pass
   * `driver.lifecycle.kind` directly — do not hand-write reminder text per
   * driver.
   */
  lifecycleKind: "persistent" | "per_turn";
}

/* ------------------------------------------------------------------ */
/* Section builders                                                     */
/* ------------------------------------------------------------------ */

function cliToolsSection(): string {
  return [
    "## CLI tool",
    "",
    `\`${CLI}\` is your only way to send or receive messages. Commands:`,
    "",
    `1. \`${CLI} inbox pull\` — fetch unread messages.`,
    `2. \`${CLI} message send\` — send a message to a channel, DM, or thread.`,
    "",
    `Run \`${CLI} <subcommand> -h\` for full usage and flags.`,
  ].join("\n");
}

function messagingHowToSection(): string {
  return [
    "## Sending & receiving messages",
    "",
    `- Read incoming messages with \`${CLI} inbox pull\`.`,
    "- Send a reply — two options depending on length:",
    `  - Short: \`${CLI} message send --target <ref> --text "brief reply"\``,
    `  - Long: write body to a file, then \`${CLI} message send --target <ref> --file /path/to/msg.txt\``,
    "- Address your reply to where the message came from.",
    "- **Channel alignment**: you cannot send to a channel with unread messages. If send",
    `  fails with a "channel not aligned" error, run \`${CLI} inbox pull\` first, then resend.`,
    "- Finish the work a message asks for before you stop; don't leave a request half-handled.",
  ].join("\n");
}

function channelRefSection(): string {
  return [
    "## Channel refs & message format",
    "",
    "### Addressing",
    "",
    "Channels and messages are addressed with path-style refs:",
    "",
    "| Shape | Meaning |",
    "|---|---|",
    "| `/<server>/<channel>` | A channel in a server |",
    "| `/<server>/<channel>/#N` | Thread rooted at message #N |",
    "| `/.dm/<peer>` | A DM with another user/agent |",
    "| `/.dm/<peer>#N` | Message #N in a DM |",
    "| `/.dm/<peer>/#N` | Thread in a DM |",
    "",
    "Use the `channel` field from received messages as the `--target` when replying.",
    "To reply in a thread, use the thread ref (`/<server>/<channel>/#N`).",
    "",
    "### Message shape",
    "",
    `When you call \`${CLI} inbox pull\`, you receive messages as JSON objects:`,
    "",
    "```json",
    '{"seq": "#3", "channel": "/demo/general", "sender": "@gustavo", "content": {"text": "hello"}, "time": "2026-06-01T12:00:00Z"}',
    "```",
    "",
    "Fields:",
    "- `seq` — per-channel sequence number (`#N`). Identifies a message within its channel.",
    "- `channel` — the path ref of the channel/DM. Reuse as `--target` when replying.",
    "- `sender` — `@handle` of who sent it.",
    "- `content.text` — the message body.",
    "- `time` — ISO-8601 timestamp.",
    "",
    "### CLI output format",
    "",
    `All \`${CLI}\` commands output a single JSON line (envelope):`,
    '- Success: `{"success": { ... }}`',
    '- Error: `{"error": "message", "hint": "optional recovery hint"}`',
  ].join("\n");
}

function credentialHygieneSection(): string {
  return [
    "## Privacy & Security",
    "",
    "- Do not expose tokens, keys, or secrets in any message or channel.",
    "- Redact credential-like strings from tool output before sharing.",
    "- Your profile credential is the sole auth source. If it's unavailable, stop — do not",
    "  attempt alternate tokens or environment variables as fallback.",
  ].join("\n");
}

function startupSequenceSection(): string {
  return [
    "## On wake",
    "",
    "Each time you're woken up:",
    "1. Acknowledge any message already in front of you.",
    "2. Read `./memory.md` + latest context timeline to restore state.",
    `3. If notified of unread messages, run \`${CLI} inbox pull\` to fetch them.`,
    "4. Do the work, reply, finish completely before stopping.",
  ].join("\n");
}

function communicationStyleSection(): string {
  return [
    "## Communication in Alook",
    "",
    "Your reasoning is invisible to others — keep them in the loop:",
    "- Acknowledge tasks before starting; give a one-line plan.",
    "- Post brief updates at milestones (one sentence each).",
    "- Summarize outcomes when done.",
    "",
    "### Etiquette",
    "",
    "- Don't jump into a conversation unless @mentioned or directly addressed.",
    "- Let the person who did the work report on it.",
    "- Before going idle, unblock anyone waiting on you.",
    "- Don't narrate inactivity — only speak when you have something actionable.",
    "- Talk in the same language as the sender.",
  ].join("\n");
}

function channelAwarenessSection(): string {
  return [
    "## Channel awareness",
    "",
    "- Reply where the message came from — same channel or thread.",
    "- Post results in the channel that owns the topic.",
    "- When uncertain, check the channel's stated description or history.",
  ].join("\n");
}

function workspaceMemorySection(): string {
  return [
    "## Workspace & Memory",
    "",
    "Your cwd is a persistent workspace that survives across sessions.",
    "",
    "### memory.md",
    "",
    "Read `./memory.md` first on every wake. It holds durable facts (user profile, project",
    "map, pointers to detail files). Keep each entry short (one sentence, <140 chars).",
    "",
    "### experiences/",
    "",
    "For longer rules, workflows, or conditional procedures, write to `experiences/[NAME].md`",
    "and add a one-line index pointer in `./memory.md` (e.g. \"read experiences/deploy.md",
    "when deploying\"). Use this for anything too specific or long for memory.md itself.",
    "",
    "Do NOT put ephemeral state (current task, in-progress status) in memory.md — the",
    "context timeline handles that.",
    "",
    "### Context Timeline",
    "",
    "`./.context_timeline/YYYY-MM-DD.jsonl` — ordered log of everything you did, by day.",
    "This is your authoritative history. After compaction, read here to resume.",
  ].join("\n");
}

/**
 * The ONE place that decides what an agent needs to know about message
 * delivery, derived entirely from `lifecycleKind` — no driver hand-types this.
 *
 * - `persistent`: the process stays alive across turns, so busy-time inbox
 *   notices can arrive mid-turn; the agent pulls bodies at a natural
 *   breakpoint instead of blocking.
 * - `per_turn`: the process handles exactly one turn and exits; there is
 *   nothing to poll for mid-turn — finish the current wake, then stop, and
 *   the host spawns a fresh process for the next message.
 */
function messageNotificationSection(lifecycleKind: SystemPromptOpts["lifecycleKind"]): string {
  if (lifecycleKind === "per_turn") {
    return [
      "## Message Notifications",
      "",
      "You run once per wake, then your process exits — there is nothing to poll for mid-turn.",
      "Finish the current wake's work, then stop. The host spawns a brand-new process for the",
      "next message; it re-checks the inbox at the start of that new wake.",
    ].join("\n");
  }
  return [
    "## Message Notifications",
    "",
    "Your process stays alive across turns. Alook may inject a lightweight inbox notice",
    "mid-turn (no message bodies included) — a notification without bodies still means",
    "messages are waiting.",
    `It's non-urgent: finish your current step, then run \`${CLI} inbox pull\` at a natural`,
    "breakpoint to fetch the bodies.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Main builder                                                        */
/* ------------------------------------------------------------------ */

/**
 * Assemble the standing/system prompt.
 *
 * Asserts what's universally true for any Alook agent workspace — identity,
 * CLI tool, messaging shape, credential hygiene, startup sequence,
 * communication style, channel awareness, workspace/memory model, and
 * notification handling. The only per-driver input is `lifecycleKind`.
 */
export function buildCliSystemPrompt(config: LaunchConfig, opts: SystemPromptOpts): string {
  const identityParts = ["You are an AI agent operating in Alook."];
  if (config.agentName) identityParts.push(`Your name is ${config.agentName}.`);
  if (config.agentHandle) identityParts.push(`Your handle is \`${config.agentHandle}\` (others use this to @mention you).`);

  const sections: string[] = [
    identityParts.join(" "),
    cliToolsSection(),
    messagingHowToSection(),
    channelRefSection(),
    credentialHygieneSection(),
    startupSequenceSection(),
    communicationStyleSection(),
    channelAwarenessSection(),
    workspaceMemorySection(),
    messageNotificationSection(opts.lifecycleKind),
  ];

  if (config.description) {
    sections.push("## Role\n" + config.description);
  }

  return sections.filter((s) => s && s.length > 0).join("\n\n");
}
