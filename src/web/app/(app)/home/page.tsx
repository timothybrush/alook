"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAgentContext } from "@/contexts/agent-context";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const { agents, runtimes, loading, chatWithAgent } = useAgentContext();
  const redirectedRef = useRef(false);

  // Auto-redirect to first agent's chat
  useEffect(() => {
    if (loading || redirectedRef.current) return;
    if (agents.length === 0) return;

    redirectedRef.current = true;
    const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name));
    const first = sorted[0];

    chatWithAgent(first.id).then((conversationId) => {
      if (conversationId) {
        router.replace(`/chat/${conversationId}?agent=${first.id}`);
      } else {
        redirectedRef.current = false;
      }
    });
  }, [agents, loading, chatWithAgent, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Redirecting to first agent chat
  if (agents.length > 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state — no agents
  const hasMachines = runtimes.length > 0;

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center animate-[fade-up_400ms_ease-out_both]">
        {hasMachines ? (
          <>
            <p className="text-muted-foreground text-sm">No agents yet.</p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => router.push("/agents/new")}
            >
              Create Agent
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">No machines yet.</p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => router.push("/runtimes")}
            >
              Connect Machine
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
