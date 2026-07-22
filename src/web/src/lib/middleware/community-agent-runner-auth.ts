import { NextRequest, NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { queries, withD1Retry, createLogger } from "@alook/shared"
import { getDb } from "@/lib/db"

const log = createLogger({ service: "community-agent-runner-auth" })

interface AgentRunnerAuthContext {
  env: Env
  /** The BOT's own user id — `row.agentId` from `findActiveAgentRunnerKeyByBearer`. */
  botUserId: string
  /** The bot's OWNER (the human who ran `mintAgentRunnerKey`) — `row.userId`. */
  ownerUserId: string
  machineId: string
}

export type AgentRunnerAuthenticatedHandler = (
  req: NextRequest,
  ctx: AgentRunnerAuthContext & { params?: Record<string, string> }
) => Promise<NextResponse | Response>

const RETRY_OPTS = { route: "community-agent-runner-auth" }

function serviceUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "database temporarily unavailable" },
    { status: 503, headers: { "Retry-After": "1" } },
  )
}

/**
 * Run a D1 lookup through `withD1Retry`; on retry-exhaust log the failing
 * step and return a `NextResponse` sentinel the caller can early-return.
 * Every lookup MUST route through this helper so a new step can't
 * accidentally ship with a bare `try/catch` that either swallows the log
 * or converts the 503 into a 401 (which would rotate CLI runner keys).
 */
async function lookupOr503<T>(
  step: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, value: await withD1Retry(fn, RETRY_OPTS) }
  } catch (err) {
    log.warn("d1_lookup_failed", { step, err: err instanceof Error ? err : new Error(String(err)) })
    return { ok: false, response: serviceUnavailable() }
  }
}

/**
 * Agent-runner auth middleware for the CLI bridge (`/api/community/agent/*`).
 * Requires `Authorization: Bearer crk_…`. Cloned from `withCommunityDaemonAuth`
 * but needs BOTH a bot identity and an owner identity — both come off the
 * single `findActiveAgentRunnerKeyByBearer` row, no extra DB call required.
 *
 * Field mapping (do not invert): `row.userId` is the bot's OWNER;
 * `row.agentId` is the BOT's own user id. `row.doName` here is the runner
 * key's own DO-hash, unrelated to wake dispatch — never threaded through.
 *
 * D1-transient failure semantics: each of the 3 D1 reads runs through
 * `withD1Retry`; on retry-exhaust we return 503 + `Retry-After: 1` (RFC 9110
 * §15.6.4). What that buys us: 401 is reserved for real auth failures (bad
 * token, revoked runner key, bot deleted, binding mismatch) — so a
 * transient D1 blip surfaces as "temporarily unavailable" and does NOT
 * trip the CLI's runner-key rotation path (which is only ever driven by
 * 401). The CLI itself does not auto-retry on 503 today; the bot's next
 * wake naturally re-issues the command against a healthy D1.
 */
export function withAgentRunnerAuth(handler: AgentRunnerAuthenticatedHandler) {
  return async (
    req: NextRequest,
    context?: { params?: Promise<Record<string, string>> | Record<string, string> }
  ) => {
    const resolvedParams = context?.params
      ? context.params instanceof Promise
        ? await context.params
        : context.params
      : undefined

    const authHeader = req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing or malformed Authorization header" }, { status: 401 })
    }
    const raw = authHeader.slice(7).trim()
    if (!raw.startsWith("crk_")) {
      return NextResponse.json({ error: "invalid runner key" }, { status: 401 })
    }

    const { env } = await getCloudflareContext({ async: true })
    const cloudflareEnv = env as Env
    const db = getDb(cloudflareEnv.DB)

    const rowLookup = await lookupOr503("findActiveAgentRunnerKeyByBearer", () =>
      queries.communityMachine.findActiveAgentRunnerKeyByBearer(db, raw),
    )
    if (!rowLookup.ok) return rowLookup.response
    const row = rowLookup.value
    if (!row) {
      return NextResponse.json({ error: "runner key revoked or unknown" }, { status: 401 })
    }

    const botLookup = await lookupOr503("getUserInternal", () =>
      queries.user.getUserInternal(db, row.agentId),
    )
    if (!botLookup.ok) return botLookup.response
    const botUser = botLookup.value
    if (!botUser || !botUser.isBot || botUser.deletedAt !== null) {
      return NextResponse.json({ error: "bot not found or inactive" }, { status: 401 })
    }

    const bindingLookup = await lookupOr503("getBotBinding", () =>
      queries.communityBot.getBotBinding(db, row.agentId),
    )
    if (!bindingLookup.ok) return bindingLookup.response
    const binding = bindingLookup.value
    if (!binding || binding.machineId !== row.machineId) {
      return NextResponse.json({ error: "bot binding mismatch" }, { status: 401 })
    }

    return handler(req, {
      env: cloudflareEnv,
      botUserId: row.agentId,
      ownerUserId: row.userId,
      machineId: row.machineId,
      params: resolvedParams,
    })
  }
}
