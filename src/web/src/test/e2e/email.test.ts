import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "crypto"
import { seedTestData, cleanupTestData, type TestSeed } from "../helpers/seed"
import { tokenRequest } from "../helpers/auth"
import { sql, sqlQuery } from "../helpers/db"

const EMAIL_WORKER_URL = process.env.EMAIL_WORKER_URL ?? "http://localhost:8787"

let seed: TestSeed

beforeAll(() => {
  seed = seedTestData()
})
afterAll(() => cleanupTestData(seed))

/** Build a minimal RFC 5322 email with Message-ID (required by wrangler) */
function rawEmail(from: string, to: string, subject: string, body: string): string {
  const msgId = `<${randomUUID()}@e2e.test>`
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-ID: ${msgId}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    "",
    body,
  ].join("\r\n")
}

/** Poll D1 until at least one email row matches, or timeout */
async function waitForEmail(
  agentId: string,
  fromEmail: string,
  maxMs = 5000,
): Promise<Record<string, unknown> | null> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const rows = sqlQuery<Record<string, unknown>>(
      `SELECT * FROM emails WHERE agent_id = '${agentId}' AND from_email = '${fromEmail}' ORDER BY created_at DESC LIMIT 1`,
    )
    if (rows.length > 0) return rows[0]
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

// ─── Receive path ───

describe("email receive (inbound)", () => {
  it("whitelisted sender → DB record with is_whitelisted = 1", async () => {
    const from = `${seed.userId}@test.local` // whitelisted in seed
    const to = `${seed.agentEmailHandle}@alook.ai`
    const subject = "E2E whitelisted test"

    const res = await fetch(
      `${EMAIL_WORKER_URL}/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawEmail(from, to, subject, "Hello from e2e"),
      },
    )
    // wrangler returns 200 for accepted emails
    expect(res.status).toBe(200)

    const row = await waitForEmail(seed.agentId, from)
    expect(row).not.toBeNull()
    expect(row!.subject).toBe(subject)
    expect(row!.is_whitelisted).toBe(1)
  })

  it("non-whitelisted sender → DB record with is_whitelisted = 0", async () => {
    const from = "stranger@external.com"
    const to = `${seed.agentEmailHandle}@alook.ai`
    const subject = "E2E non-whitelisted test"

    await fetch(
      `${EMAIL_WORKER_URL}/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawEmail(from, to, subject, "Stranger email"),
      },
    )

    const row = await waitForEmail(seed.agentId, from)
    expect(row).not.toBeNull()
    expect(row!.subject).toBe(subject)
    expect(row!.is_whitelisted).toBe(0)
  })

  it("unknown handle → no email record created", async () => {
    const from = "anyone@example.com"
    const to = "nonexistent-handle-xyz@alook.ai"
    const subject = "E2E unknown handle"

    await fetch(
      `${EMAIL_WORKER_URL}/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawEmail(from, to, subject, "Should be rejected"),
      },
    )

    // Small wait to ensure nothing is written
    await new Promise((r) => setTimeout(r, 1000))

    const rows = sqlQuery<Record<string, unknown>>(
      `SELECT * FROM emails WHERE from_email = '${from}' AND subject = '${subject}'`,
    )
    expect(rows).toHaveLength(0)
  })
})

// ─── Threading on ingest ───

describe("email threading (inbound)", () => {
  it("stores Message-ID, In-Reply-To, References from incoming email", async () => {
    const from = `${seed.userId}@test.local`
    const to = `${seed.agentEmailHandle}@alook.ai`
    const subject = "E2E threading test"
    const msgId = `<threading-${randomUUID()}@e2e.test>`
    const inReplyTo = `<parent-${randomUUID()}@e2e.test>`
    const references = `<root-${randomUUID()}@e2e.test> ${inReplyTo}`

    const raw = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: ${msgId}`,
      `In-Reply-To: ${inReplyTo}`,
      `References: ${references}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      "Thread test body",
    ].join("\r\n")

    await fetch(
      `${EMAIL_WORKER_URL}/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: raw },
    )

    const row = await waitForEmail(seed.agentId, from, 5000)
    expect(row).not.toBeNull()
    expect(row!.message_id).toBe(msgId)
    expect(row!.in_reply_to).toBe(inReplyTo)
    expect(row!.references).toBe(references)
  })

  it("stores empty strings when threading headers are absent", async () => {
    const from = `${seed.userId}@test.local`
    const to = `${seed.agentEmailHandle}@alook.ai`
    const subject = `E2E no-thread ${randomUUID().slice(0, 8)}`

    await fetch(
      `${EMAIL_WORKER_URL}/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawEmail(from, to, subject, "No threading headers"),
      },
    )

    // Wait for this specific email by subject
    const start = Date.now()
    let row: Record<string, unknown> | null = null
    while (Date.now() - start < 5000) {
      const rows = sqlQuery<Record<string, unknown>>(
        `SELECT * FROM emails WHERE agent_id = '${seed.agentId}' AND subject = '${subject}' LIMIT 1`,
      )
      if (rows.length > 0) { row = rows[0]; break }
      await new Promise((r) => setTimeout(r, 300))
    }

    expect(row).not.toBeNull()
    expect(row!.in_reply_to).toBe("")
    expect(row!.references).toBe("")
  })
})

// ─── Rejected folder ───

describe("email folder: rejected", () => {
  it("GET /api/email?folder=rejected returns only non-whitelisted emails", async () => {
    // Ensure we have a non-whitelisted email
    const strangerFrom = `stranger-${randomUUID().slice(0, 8)}@external.com`
    const to = `${seed.agentEmailHandle}@alook.ai`
    await fetch(
      `${EMAIL_WORKER_URL}/cdn-cgi/handler/email?from=${encodeURIComponent(strangerFrom)}&to=${encodeURIComponent(to)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawEmail(strangerFrom, to, "Rejected folder test", "Spam content"),
      },
    )
    await waitForEmail(seed.agentId, strangerFrom)

    const res = await tokenRequest(
      `/api/email?workspace_id=${seed.workspaceId}&agentId=${seed.agentId}&folder=rejected`,
      seed.machineToken,
    )
    expect(res.status).toBe(200)

    const emails = await res.json() as { is_whitelisted: boolean }[]
    expect(emails.length).toBeGreaterThan(0)
    for (const email of emails) {
      expect(email.is_whitelisted).toBe(false)
    }
  })

  it("GET /api/email?folder=rejected excludes sent emails", async () => {
    // Send an outgoing email (creates a record with is_whitelisted=false)
    await tokenRequest(
      `/api/email/send?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: seed.agentId,
          to: "outbound@example.com",
          subject: "E2E sent email",
          htmlBody: "<p>Outbound</p>",
        }),
      },
    )

    const res = await tokenRequest(
      `/api/email?workspace_id=${seed.workspaceId}&agentId=${seed.agentId}&folder=rejected`,
      seed.machineToken,
    )
    expect(res.status).toBe(200)

    const emails = await res.json() as { from_email: string; to_email: string }[]
    const agentEmail = `${seed.agentEmailHandle}@alook.ai`
    for (const email of emails) {
      expect(email.from_email).not.toBe(agentEmail)
    }
  })

  it("GET /api/email?folder=inbox returns only whitelisted emails", async () => {
    const res = await tokenRequest(
      `/api/email?workspace_id=${seed.workspaceId}&agentId=${seed.agentId}&folder=inbox`,
      seed.machineToken,
    )
    expect(res.status).toBe(200)

    const emails = await res.json() as { is_whitelisted: boolean }[]
    for (const email of emails) {
      expect(email.is_whitelisted).toBe(true)
    }
  })
})

// ─── Send path ───

describe("email send (outbound)", () => {
  it("POST /api/email/send → 200 with r2_key and DB record", async () => {
    const res = await tokenRequest(
      `/api/email/send?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: seed.agentId,
          to: "recipient@example.com",
          subject: "E2E send test",
          htmlBody: "<p>Hello from e2e</p>",
        }),
      },
    )
    expect(res.status).toBe(200)

    const data = await res.json() as Record<string, unknown>
    expect(data.r2_key).toBeTruthy()
    expect(data.from_email).toBe(`${seed.agentEmailHandle}@alook.ai`)
    expect(data.to_email).toBe("recipient@example.com")
    expect(data.subject).toBe("E2E send test")
  })

  it("POST /api/email/send with agent missing emailHandle → 400", async () => {
    // Create a temporary agent without emailHandle
    const tmpAgentId = `ag_tmp_${Date.now()}`
    const now = new Date().toISOString()
    sql(`INSERT INTO agent (id, workspace_id, name, runtime_id, created_at, updated_at) VALUES ('${tmpAgentId}', '${seed.workspaceId}', 'No Handle Agent', '${seed.runtimeId}', '${now}', '${now}')`)

    try {
      const res = await tokenRequest(
        `/api/email/send?workspace_id=${seed.workspaceId}`,
        seed.machineToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: tmpAgentId,
            to: "someone@example.com",
            subject: "Should fail",
            htmlBody: "<p>No handle</p>",
          }),
        },
      )
      expect(res.status).toBe(400)
    } finally {
      sql(`DELETE FROM agent WHERE id = '${tmpAgentId}'`)
    }
  })

  it("POST /api/email/send missing required fields → 400", async () => {
    const res = await tokenRequest(
      `/api/email/send?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: seed.agentId }),
      },
    )
    expect(res.status).toBe(400)
  })

  it("POST /api/email/send with threading → stores message_id, in_reply_to, references", async () => {
    const inReplyTo = `<parent-${randomUUID()}@e2e.test>`
    const references = `<root-${randomUUID()}@e2e.test> ${inReplyTo}`

    const res = await tokenRequest(
      `/api/email/send?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: seed.agentId,
          to: "recipient@example.com",
          subject: "E2E reply test",
          htmlBody: "<p>Reply body</p>",
          inReplyTo,
          references,
        }),
      },
    )
    expect(res.status).toBe(200)

    const data = await res.json() as Record<string, unknown>
    expect(data.message_id).toBeTruthy()
    expect(typeof data.message_id).toBe("string")
    expect((data.message_id as string).length).toBeGreaterThan(0)
    expect(data.in_reply_to).toBe(inReplyTo)
    expect(data.references).toBe(references)
  })
})

// ─── Thread endpoint ───

describe("email thread", () => {
  it("GET /api/email/[id]/thread returns parent chain", async () => {
    const agentEmail = `${seed.agentEmailHandle}@alook.ai`
    const now = new Date().toISOString()
    const parentMsgId = `<thread-parent-${randomUUID()}@e2e.test>`
    const childMsgId = `<thread-child-${randomUUID()}@e2e.test>`

    // Insert parent email directly
    const parentId = `ep_${randomUUID().slice(0, 12)}`
    sql(`INSERT INTO emails (id, agent_id, workspace_id, from_email, to_email, subject, r2_key, is_whitelisted, forwarded, message_id, in_reply_to, "references", created_at) VALUES ('${parentId}', '${seed.agentId}', '${seed.workspaceId}', 'sender@test.com', '${agentEmail}', 'Thread parent', 'emails/fake/raw', 1, 0, '${parentMsgId}', '', '', '${now}')`)

    // Insert child email that replies to parent
    const childId = `ec_${randomUUID().slice(0, 12)}`
    sql(`INSERT INTO emails (id, agent_id, workspace_id, from_email, to_email, subject, r2_key, is_whitelisted, forwarded, message_id, in_reply_to, "references", created_at) VALUES ('${childId}', '${seed.agentId}', '${seed.workspaceId}', '${agentEmail}', 'sender@test.com', 'Re: Thread parent', 'emails/fake2/raw', 0, 0, '${childMsgId}', '${parentMsgId}', '${parentMsgId}', '${now}')`)

    const res = await tokenRequest(
      `/api/email/${childId}/thread?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
    )
    expect(res.status).toBe(200)

    const thread = await res.json() as { id: string; message_id: string }[]
    expect(thread.length).toBe(1)
    expect(thread[0].id).toBe(parentId)
    expect(thread[0].message_id).toBe(parentMsgId)
  })

  it("GET /api/email/[id]/thread returns empty array for root email", async () => {
    const agentEmail = `${seed.agentEmailHandle}@alook.ai`
    const now = new Date().toISOString()
    const rootId = `er_${randomUUID().slice(0, 12)}`
    const rootMsgId = `<root-${randomUUID()}@e2e.test>`

    sql(`INSERT INTO emails (id, agent_id, workspace_id, from_email, to_email, subject, r2_key, is_whitelisted, forwarded, message_id, in_reply_to, "references", created_at) VALUES ('${rootId}', '${seed.agentId}', '${seed.workspaceId}', 'sender@test.com', '${agentEmail}', 'Root email', 'emails/fake3/raw', 1, 0, '${rootMsgId}', '', '', '${now}')`)

    const res = await tokenRequest(
      `/api/email/${rootId}/thread?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
    )
    expect(res.status).toBe(200)

    const thread = await res.json() as unknown[]
    expect(thread).toHaveLength(0)
  })

  it("GET /api/email/[id]/thread respects MAX_DEPTH limit", async () => {
    const agentEmail = `${seed.agentEmailHandle}@alook.ai`
    const now = new Date().toISOString()
    const depth = 55 // exceeds MAX_DEPTH of 50

    // Build a chain of 55 emails where each replies to the previous
    const emailIds: string[] = []
    const msgIds: string[] = []
    for (let i = 0; i < depth; i++) {
      const eid = `edepth_${randomUUID().slice(0, 8)}`
      const mid = `<depth-${i}-${randomUUID().slice(0, 8)}@e2e.test>`
      const irt = i > 0 ? msgIds[i - 1] : ""
      emailIds.push(eid)
      msgIds.push(mid)
      sql(`INSERT INTO emails (id, agent_id, workspace_id, from_email, to_email, subject, r2_key, is_whitelisted, forwarded, message_id, in_reply_to, "references", created_at) VALUES ('${eid}', '${seed.agentId}', '${seed.workspaceId}', 'sender@test.com', '${agentEmail}', 'Depth ${i}', 'emails/fake-depth/raw', 1, 0, '${mid}', '${irt}', '', '${now}')`)
    }

    // Query thread for the last email in the chain
    const lastId = emailIds[depth - 1]
    const res = await tokenRequest(
      `/api/email/${lastId}/thread?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
    )
    expect(res.status).toBe(200)

    const thread = await res.json() as unknown[]
    expect(thread.length).toBeLessThanOrEqual(50)
  })
})
