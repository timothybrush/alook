import { eq, desc, and } from "drizzle-orm";
import { emails } from "../schema";
import type { Database } from "../index";

export async function createEmail(
  db: Database,
  data: { agentId: string; workspaceId: string; fromEmail: string; toEmail: string; subject: string; r2Key: string; isWhitelisted: boolean; forwarded: boolean; htmlBody?: string; attachments?: string }
) {
  const rows = await db.insert(emails).values(data).returning();
  return rows[0]!;
}

export async function getEmailById(db: Database, id: string, workspaceId: string) {
  const rows = await db.select().from(emails).where(and(eq(emails.id, id), eq(emails.workspaceId, workspaceId)));
  return rows[0] ?? null;
}

export async function getEmailsByAgent(db: Database, agentId: string, workspaceId: string) {
  return db
    .select()
    .from(emails)
    .where(and(eq(emails.agentId, agentId), eq(emails.workspaceId, workspaceId)))
    .orderBy(desc(emails.createdAt));
}

export async function getInboxEmails(db: Database, agentId: string, agentEmail: string, workspaceId: string) {
  return db.select().from(emails)
    .where(and(eq(emails.agentId, agentId), eq(emails.toEmail, agentEmail), eq(emails.workspaceId, workspaceId)))
    .orderBy(desc(emails.createdAt));
}

export async function getSentEmails(db: Database, agentId: string, agentEmail: string, workspaceId: string) {
  return db.select().from(emails)
    .where(and(eq(emails.agentId, agentId), eq(emails.fromEmail, agentEmail), eq(emails.workspaceId, workspaceId)))
    .orderBy(desc(emails.createdAt));
}

export async function deleteEmail(db: Database, id: string, workspaceId: string) {
  return db.delete(emails).where(and(eq(emails.id, id), eq(emails.workspaceId, workspaceId)));
}
