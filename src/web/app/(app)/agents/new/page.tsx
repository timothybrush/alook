"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import type { Runtime } from "@/lib/types";

export default function CreateAgentPage() {
  const router = useRouter();
  const {
    runtimes,
    handleCreateAgent,
    chatWithAgent,
    getFirstOnlineRuntimeId,
  } = useAgentContext();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [runtimeId, setRuntimeId] = useState(getFirstOnlineRuntimeId());
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const agent = await handleCreateAgent({
        name,
        description: description || undefined,
        instructions: instructions || undefined,
        runtime_id: runtimeId,
      });
      if (agent) {
        const conversationId = await chatWithAgent(agent.id);
        if (conversationId) {
          router.push(`/chat/${conversationId}?agent=${agent.id}`);
        } else {
          router.push("/home");
        }
      }
    } finally {
      setCreating(false);
    }
  };

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

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border/50 px-5 py-2.5">
        <h1 className="text-sm font-medium">Create Agent</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-md space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Agent"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-description">Description</Label>
            <Input
              id="agent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-instructions">Instructions</Label>
            <Textarea
              id="agent-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="System prompt or instructions..."
              rows={6}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-runtime">Runtime</Label>
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
            <Button type="submit" size="sm" disabled={creating || !runtimeId}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
