import { z } from "zod";
import { TASK_TYPES } from "./constants";

// ---------------------------------------------------------------------------
// Task status
// ---------------------------------------------------------------------------

export const TaskStatusSchema = z.enum([
  "queued",
  "dispatched",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

// ---------------------------------------------------------------------------
// Raw SQL row from agent_task_queue (boundary: DB -> App)
// ---------------------------------------------------------------------------

export const ClaimedTaskRowSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  runtimeId: z.string(),
  workspaceId: z.string(),
  conversationId: z.string(),
  prompt: z.string(),
  status: z.string(),
  priority: z.coerce.number(),
  result: z.unknown().nullable(),
  context: z.unknown().nullable(),
  type: z.string().default(TASK_TYPES.USER_DM_MESSAGE),
  sessionId: z.string().nullable(),
  createdAt: z.coerce.date(),
  dispatchedAt: z.coerce.date().nullable(),
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  error: z.string().nullable(),
});
export type ClaimedTaskRow = z.infer<typeof ClaimedTaskRowSchema>;

// ---------------------------------------------------------------------------
// API wire format — task agent data (embedded in claim response)
// ---------------------------------------------------------------------------

export const TaskAgentDataApiSchema = z.object({
  instructions: z.string(),
  name: z.string(),
  runtime_config: z.record(z.string(), z.unknown()).default({}),
});
export type TaskAgentDataApi = z.infer<typeof TaskAgentDataApiSchema>;

// ---------------------------------------------------------------------------
// API wire format — base task (output of taskToResponse)
// ---------------------------------------------------------------------------

export const TaskApiBaseSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  runtime_id: z.string(),
  conversation_id: z.string(),
  workspace_id: z.string(),
  prompt: z.string(),
  status: z.string(),
  priority: z.number(),
  dispatched_at: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  type: z.string(),
});
export type TaskApiBase = z.infer<typeof TaskApiBaseSchema>;

// ---------------------------------------------------------------------------
// API wire format — full task (claim response includes agent + prior session)
// ---------------------------------------------------------------------------

export const TaskApiSchema = TaskApiBaseSchema.extend({
  agent: TaskAgentDataApiSchema.nullable().optional(),
});
export type TaskApi = z.infer<typeof TaskApiSchema>;

// ---------------------------------------------------------------------------
// Poll request/response (replaces heartbeat + per-runtime claim)
// ---------------------------------------------------------------------------

export const PollRequestSchema = z.object({
  runtime_ids: z.array(z.string().min(1)).min(1),
  max_tasks: z.number().int().min(1).default(1),
});
export type PollRequest = z.infer<typeof PollRequestSchema>;

export const PollResponseSchema = z.object({
  tasks: z.array(TaskApiSchema),
  evicted: z.boolean().optional(),
});
export type PollResponse = z.infer<typeof PollResponseSchema>;

// ---------------------------------------------------------------------------
// Register response
// ---------------------------------------------------------------------------

export const RegisterResponseSchema = z.object({
  runtimes: z.array(z.object({ id: z.string() })),
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// ---------------------------------------------------------------------------
// Daemon API request schemas
// ---------------------------------------------------------------------------

export const DaemonRuntimeItemSchema = z.object({
  type: z.string().optional(),
  provider: z.string().optional(),
  runtime_mode: z.string().optional(),
  name: z.string().optional(),
  version: z.string().optional(),
  status: z.string().optional(),
  model: z.string().optional(),
});
export type DaemonRuntimeItem = z.infer<typeof DaemonRuntimeItemSchema>;

export const ActivateTokenRuntimeSchema = z.object({
  type: z.string().min(1),
  version: z.string().optional().default(""),
});
export type ActivateTokenRuntime = z.infer<typeof ActivateTokenRuntimeSchema>;

export const ActivateTokenRequestSchema = z.object({
  token: z.string().min(1),
  hostname: z.string().min(1),
  runtimes: z.array(ActivateTokenRuntimeSchema).min(1),
});
export type ActivateTokenRequest = z.infer<typeof ActivateTokenRequestSchema>;

export const RegisterDaemonRequestSchema = z.object({
  workspace_id: z.string().min(1),
  daemon_id: z.string().min(1),
  device_name: z.string().optional().default(""),
  cli_version: z.string().optional().default(""),
  runtimes: z.array(DaemonRuntimeItemSchema).min(1),
});
export type RegisterDaemonRequest = z.infer<typeof RegisterDaemonRequestSchema>;

export const DeregisterRequestSchema = z.object({
  runtime_ids: z.array(z.string()).default([]),
});
export type DeregisterRequest = z.infer<typeof DeregisterRequestSchema>;


export const CompleteTaskRequestSchema = z.object({
  output: z.string().optional(),
  session_id: z.string().optional(),
  branch_name: z.string().optional(),
});
export type CompleteTaskRequest = z.infer<typeof CompleteTaskRequestSchema>;

export const FailTaskRequestSchema = z.object({
  error: z.string().optional().default(""),
});
export type FailTaskRequest = z.infer<typeof FailTaskRequestSchema>;

export const MessageItemSchema = z.object({
  seq: z.number(),
  type: z.string(),
  tool: z.string().optional(),
  call_id: z.string().optional(),
  content: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.string().optional(),
});
export type MessageItem = z.infer<typeof MessageItemSchema>;

export const ReportMessagesRequestSchema = z.object({
  messages: z.array(MessageItemSchema),
});
export type ReportMessagesRequest = z.infer<typeof ReportMessagesRequestSchema>;

// ---------------------------------------------------------------------------
// Agent request schemas
// ---------------------------------------------------------------------------

const RuntimeConfigSchema = z
  .object({ model: z.string().max(100).optional() })
  .passthrough()
  .optional();

export const CreateAgentRequestSchema = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().optional().default(""),
  instructions: z.string().optional().default(""),
  runtime_id: z.string().min(1, "runtime_id is required"),
  runtime_config: RuntimeConfigSchema,
  max_concurrent_tasks: z.number().int().optional(),
  email_handle: z.string().optional(),
});
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;

export const UpdateAgentRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    instructions: z.string().optional(),
    runtime_id: z.string().min(1).optional(),
    runtime_config: RuntimeConfigSchema,
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.instructions !== undefined ||
      v.runtime_id !== undefined ||
      v.runtime_config !== undefined,
    { message: "at least one field is required" },
  );
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequestSchema>;

// ---------------------------------------------------------------------------
// Conversation request schemas
// ---------------------------------------------------------------------------

export const CreateConversationRequestSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
});
export type CreateConversationRequest = z.infer<
  typeof CreateConversationRequestSchema
>;

// ---------------------------------------------------------------------------
// Message request schema (JSON body only — FormData path is separate)
// ---------------------------------------------------------------------------

export const CreateMessageRequestSchema = z.object({
  content: z.string().min(1, "content is required"),
});
export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

// ---------------------------------------------------------------------------
// Email request schemas
// ---------------------------------------------------------------------------

export const EmailAttachmentSchema = z.object({
  key: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  contentType: z.string().min(1),
});

export const SendEmailRequestSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
  to: z.string().min(1, "to is required"),
  subject: z.string().min(1, "subject is required"),
  htmlBody: z.string().default(""),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
  attachments: z.array(EmailAttachmentSchema).optional(),
});
export type SendEmailRequest = z.infer<typeof SendEmailRequestSchema>;

export const UpdateEmailStatusRequestSchema = z.object({
  status: z.enum(["unread", "read", "archived"]),
});
export type UpdateEmailStatusRequest = z.infer<
  typeof UpdateEmailStatusRequestSchema
>;

export const EmailNotifyRequestSchema = z.object({
  agentId: z.string().min(1),
  workspaceId: z.string().min(1),
  r2Key: z.string().min(1),
  from: z.string().min(1),
  to: z.string().optional(),
  subject: z.string().min(1),
  isWhitelisted: z.boolean(),
  forwarded: z.boolean().optional().default(false),
  messageId: z.string().optional().default(""),
  inReplyTo: z.string().optional().default(""),
  references: z.string().optional().default(""),
});
export type EmailNotifyRequest = z.infer<typeof EmailNotifyRequestSchema>;

// ---------------------------------------------------------------------------
// Workspace request schemas
// ---------------------------------------------------------------------------

export const CreateWorkspaceRequestSchema = z.object({
  name: z.string().min(1, "name is required"),
  slug: z.string().min(1, "slug is required"),
});
export type CreateWorkspaceRequest = z.infer<
  typeof CreateWorkspaceRequestSchema
>;
