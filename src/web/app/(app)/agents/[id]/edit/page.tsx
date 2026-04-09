"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAgentContext } from "@/contexts/agent-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Loader2 } from "lucide-react";
import type { Runtime } from "@/lib/types";

export default function EditAgentPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const {
    agents,
    runtimes,
    loading,
    handleUpdateAgent,
    handleDeleteAgent,
  } = useAgentContext();

  const agent = agents.find((a) => a.id === agentId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [runtimeId, setRuntimeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Populate form when agent data loads
  useEffect(() => {
    if (agent && !initialized) {
      setName(agent.name);
      setDescription(agent.description);
      setInstructions(agent.instructions);
      setRuntimeId(agent.runtime_id);
      setInitialized(true);
    }
  }, [agent, initialized]);

  // Group runtimes by machine
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await handleUpdateAgent(agentId, {
        name,
        description,
        instructions,
        runtime_id: runtimeId,
      });
      if (ok) router.back();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const ok = await handleDeleteAgent(agentId);
      if (ok) router.push("/home");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  if (loading || !agent) {
    return (
      <div className="flex flex-1 items-center justify-center">
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <p className="text-sm text-muted-foreground">Agent not found.</p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-2.5">
        <h1 className="text-sm font-medium">Edit Agent</h1>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-destructive hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
        >
          Delete
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-md space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-agent-name">Name</Label>
            <Input
              id="edit-agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Agent"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-agent-description">Description</Label>
            <Input
              id="edit-agent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-agent-instructions">Instructions</Label>
            <Textarea
              id="edit-agent-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="System prompt or instructions..."
              rows={6}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-agent-runtime">Runtime</Label>
            <Select
              value={runtimeId}
              onValueChange={(val: string | null) => {
                if (val) setRuntimeId(val);
              }}
              disabled={
                runtimes.length === 0 ||
                runtimes.every((r) => r.status !== "online")
              }
              items={runtimes.map((rt) => {
                const machine =
                  (typeof rt.device_info === "string" ? rt.device_info : "") ||
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
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !name}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove agent"
        description={`This will permanently delete "${agent.name}" and all its conversations.`}
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
