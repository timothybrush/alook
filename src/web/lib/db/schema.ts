import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default(""),
  email: text("email").unique().notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("member_workspace_user").on(t.workspaceId, t.userId)]
);

export const agentRuntime = pgTable(
  "agent_runtime",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    daemonId: text("daemon_id").notNull(),
    name: text("name").notNull().default(""),
    runtimeMode: text("runtime_mode").notNull().default("local"),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("offline"),
    deviceInfo: text("device_info").notNull().default(""),
    metadata: jsonb("metadata"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("agent_runtime_workspace_daemon_provider").on(
      t.workspaceId,
      t.daemonId,
      t.provider
    ),
  ]
);

export const agent = pgTable("agent", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  avatarUrl: text("avatar_url"),
  runtimeId: uuid("runtime_id").references(() => agentRuntime.id),
  runtimeMode: text("runtime_mode").notNull().default("local"),
  runtimeConfig: jsonb("runtime_config"),
  visibility: text("visibility").notNull().default("private"),
  status: text("status").notNull().default("idle"),
  maxConcurrentTasks: integer("max_concurrent_tasks").notNull().default(6),
  ownerId: uuid("owner_id").references(() => user.id),
  tools: jsonb("tools"),
  triggers: jsonb("triggers"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversation = pgTable("conversation", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agent.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const message = pgTable("message", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull().default(""),
  taskId: uuid("task_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentTaskQueue = pgTable(
  "agent_task_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
    runtimeId: uuid("runtime_id")
      .notNull()
      .references(() => agentRuntime.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id),
    prompt: text("prompt").notNull(),
    status: text("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    result: jsonb("result"),
    context: jsonb("context"),
    sessionId: text("session_id"),
    workDir: text("work_dir"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("idx_one_pending_per_conversation")
      .on(t.conversationId)
      .where(sql`status IN ('queued', 'dispatched')`),
    index("idx_task_queue_pending")
      .on(t.agentId, t.status)
      .where(sql`status IN ('queued', 'dispatched')`),
  ]
);

export const taskMessage = pgTable(
  "task_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => agentTaskQueue.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull().default(""),
    tool: text("tool").notNull().default(""),
    content: text("content").notNull().default(""),
    input: jsonb("input"),
    output: text("output").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_task_message_task_seq").on(t.taskId, t.seq)]
);

export const verificationCode = pgTable("verification_code", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  used: boolean("used").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const machineToken = pgTable(
  "machine_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").unique().notNull(),
    name: text("name").notNull().default(""),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_machine_token_hash").on(t.tokenHash)]
);
