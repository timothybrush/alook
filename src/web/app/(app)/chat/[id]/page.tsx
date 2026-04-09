"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAgentContext } from "@/contexts/agent-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
} from "@/components/ui/select";
import {
  getConversation,
  listMessages,
  sendMessage,
  getTask,
  getTaskMessages,
} from "@/lib/api";
import type { Conversation, Message, Task, TaskMessage, Runtime } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Send, Loader2, Pencil, Trash2, X } from "lucide-react";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = params.id as string;
  const { agents, runtimes, handleDeleteAgent, handleUpdateAgent } =
    useAgentContext();

  const agentId = searchParams.get("agent");
  const agent = agents.find((a) => a.id === agentId);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [taskMessages, setTaskMessages] = useState<TaskMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionLost, setConnectionLost] = useState(false);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editRuntimeId, setEditRuntimeId] = useState("");
  const [saving, setSaving] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeqRef = useRef(0);
  const pollFailures = useRef(0);

  const openEdit = () => {
    if (!agent) return;
    setEditName(agent.name);
    setEditDescription(agent.description);
    setEditInstructions(agent.instructions);
    setEditRuntimeId(agent.runtime_id);
    setEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    setSaving(true);
    try {
      const ok = await handleUpdateAgent(agent.id, {
        name: editName,
        description: editDescription,
        instructions: editInstructions,
        runtime_id: editRuntimeId,
      });
      if (ok) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  // Runtime groups for edit form
  const runtimeGroups = new Map<
    string,
    { label: string; runtimes: Runtime[] }
  >();
  for (const rt of runtimes) {
    const key = rt.daemon_id || rt.id;
    if (!runtimeGroups.has(key)) {
      runtimeGroups.set(key, {
        label:
          (typeof rt.device_info === "string" ? rt.device_info : "") ||
          rt.name ||
          key,
        runtimes: [],
      });
    }
    runtimeGroups.get(key)!.runtimes.push(rt);
  }

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [conv, msgs] = await Promise.all([
          getConversation(conversationId),
          listMessages(conversationId),
        ]);
        setConversation(conv);
        setMessages(msgs);
      } catch {
        toast.error("Conversation not found");
        router.push("/home");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [conversationId, router]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, taskMessages, scrollToBottom]);

  const startPolling = useCallback(
    (taskId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      lastSeqRef.current = 0;
      pollFailures.current = 0;
      setConnectionLost(false);

      pollRef.current = setInterval(async () => {
        try {
          const [task, tmsgs] = await Promise.all([
            getTask(taskId),
            getTaskMessages(taskId, lastSeqRef.current || undefined),
          ]);

          pollFailures.current = 0;
          setConnectionLost(false);
          setActiveTask(task);

          if (tmsgs.length > 0) {
            setTaskMessages((prev) => [...prev, ...tmsgs]);
            lastSeqRef.current = Math.max(
              ...tmsgs.map((m) => m.seq),
              lastSeqRef.current
            );
          }

          if (task.status === "completed" || task.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;

            try {
              const updatedMessages = await listMessages(conversationId);
              setMessages(updatedMessages);
            } catch {
              toast.error("Failed to refresh messages");
            }
            setActiveTask(null);
            setTaskMessages([]);
          }
        } catch {
          pollFailures.current += 1;
          if (pollFailures.current >= 3) {
            setConnectionLost(true);
          }
          if (pollFailures.current >= 10) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            toast.error("Lost connection to agent");
          }
        }
      }, 1000);
    },
    [conversationId]
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setInput("");
    setSending(true);

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { message, task } = await sendMessage(conversationId, content);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? message : m))
      );
      setActiveTask(task);
      setTaskMessages([]);
      startPolling(task.id);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      toast.error(
        err instanceof Error ? err.message : "Failed to send message"
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Agent navbar — stable regardless of edit/chat view */}
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {agent && (() => {
            const runtime = runtimes.find((r) => r.id === agent.runtime_id);
            const isOnline = runtime?.status === "online";
            return (
              <span
                title={isOnline ? "Runtime online" : "Runtime offline"}
                className={cn(
                  "size-2 rounded-full shrink-0",
                  isOnline ? "bg-status-online" : "bg-status-offline"
                )}
              />
            );
          })()}
          <h1 className="text-sm font-medium truncate">
            {agent?.name || "Agent"}
          </h1>
          {!editing && conversation?.title && (
            <span className="text-xs text-muted-foreground truncate">
              / {conversation.title}
            </span>
          )}
          {editing && (
            <span className="text-xs text-muted-foreground">/ Settings</span>
          )}
        </div>
        {agent && (
          <div className="flex items-center gap-0.5 shrink-0">
            {editing ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 gap-1 px-2"
                onClick={() => setEditing(false)}
              >
                <X className="size-3" />
                Cancel
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-7 gap-1 px-2"
                  onClick={openEdit}
                >
                  <Pencil className="size-3" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-7 px-2 hover:text-destructive"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="size-3" />
                  Remove
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {editing && agent ? (
        /* Inline edit form */
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <form onSubmit={handleSave} className="mx-auto max-w-md space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="My Agent"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="What does this agent do?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-instructions">Instructions</Label>
              <Textarea
                id="edit-instructions"
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                placeholder="System prompt or instructions..."
                rows={6}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-runtime">Runtime</Label>
              <Select
                value={editRuntimeId}
                onValueChange={(val: string | null) => {
                  if (val) setEditRuntimeId(val);
                }}
                disabled={
                  runtimes.length === 0 ||
                  runtimes.every((r) => r.status !== "online")
                }
                items={runtimes.map((rt) => {
                  const machine =
                    (typeof rt.device_info === "string"
                      ? rt.device_info
                      : "") ||
                    rt.name ||
                    "";
                  const label = machine
                    ? `${rt.provider} (${machine})`
                    : rt.provider;
                  return { value: rt.id, label };
                })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      runtimes.length === 0
                        ? "No runtimes — start a daemon first"
                        : runtimes.every((r) => r.status !== "online")
                          ? "All runtimes offline"
                          : "Select a runtime"
                    }
                  />
                </SelectTrigger>
                <SelectPopup portal={false}>
                  {Array.from(runtimeGroups.entries()).map(([key, group]) => (
                    <SelectGroup key={key}>
                      <SelectGroupLabel className="truncate">
                        {group.label}
                      </SelectGroupLabel>
                      {group.runtimes.map((rt) => (
                        <SelectItem
                          key={rt.id}
                          value={rt.id}
                          disabled={rt.status !== "online"}
                        >
                          <span className="flex items-center gap-2">
                            <span>{rt.provider}</span>
                            <span className="text-muted-foreground text-xs">
                              ({rt.status})
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || !editName}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5" ref={scrollRef}>
            <div className="mx-auto max-w-2xl py-6 space-y-4">
              {messages.length === 0 && !activeTask && (
                <p className="text-center text-muted-foreground py-20 text-sm">
                  Send a message to start chatting with the agent.
                </p>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {activeTask && (
                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {activeTask.status === "running"
                        ? "Agent working..."
                        : activeTask.status}
                    </Badge>
                  </div>
                  {taskMessages.length > 0 && (
                    <div className="mt-2 max-h-60 overflow-y-auto rounded bg-background p-3 font-mono text-xs space-y-1">
                      {taskMessages.map((tm) => (
                        <div key={tm.id} className="text-muted-foreground">
                          {tm.type === "tool-use" && (
                            <span className="text-primary">
                              [tool] {tm.tool}
                            </span>
                          )}
                          {tm.type === "tool-result" && (
                            <span className="text-accent-foreground">
                              [result] {tm.output || tm.content}
                            </span>
                          )}
                          {tm.type === "text" && <span>{tm.content}</span>}
                          {tm.type === "thinking" && (
                            <span className="italic opacity-60">
                              {tm.content}
                            </span>
                          )}
                          {!["tool-use", "tool-result", "text", "thinking"].includes(
                            tm.type
                          ) && (
                            <span>
                              [{tm.type}] {tm.content}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {activeTask.status === "failed" && activeTask.error && (
                    <p className="text-sm text-destructive">
                      {activeTask.error}
                    </p>
                  )}
                  {connectionLost && (
                    <p className="text-xs text-muted-foreground animate-pulse">
                      Connection lost — retrying...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-border/50 px-5 py-3">
            <div className="mx-auto flex max-w-2xl gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="min-h-[40px] resize-none"
                disabled={sending || !!activeTask}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || sending || !!activeTask}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {agent && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Remove agent"
          description={`This will permanently delete "${agent.name}" and all its conversations.`}
          loading={deleting}
          onConfirm={async () => {
            setDeleting(true);
            try {
              const ok = await handleDeleteAgent(agent.id);
              if (ok) router.push("/home");
            } finally {
              setDeleting(false);
              setConfirmOpen(false);
            }
          }}
        />
      )}
    </>
  );
}
