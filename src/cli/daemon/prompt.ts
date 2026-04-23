import type { Task, Attachment } from "./types.js";

const EMAIL_NOTICE =
  "This task was triggered automatically by an incoming email. There is no human in this session." +
  " If you need to communicate with a human, you MUST send an email using the email sending tool." +
  " If you need more information or confirmation from the human, send them an email asking for it and then exit." +
  " Do not wait — when the human replies, a new task will be triggered automatically and you will be woken up with their response.";

export function buildPrompt(task: Task, attachments?: Attachment[]): string {
  const obj: Record<string, unknown> = { type: task.type, instruction: task.prompt };
  if (task.type === "email_notification") {
    obj.notice = EMAIL_NOTICE;
  }
  if (attachments && attachments.length > 0) {
    obj.attachments = attachments.map((a) => ({
      path: a.path,
      content_type: a.content_type,
      filename: a.filename,
    }));
  }
  return JSON.stringify(obj);
}
