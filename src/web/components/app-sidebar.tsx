"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAgentContext } from "@/contexts/agent-context";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { Monitor, LogOut, Plus, Loader2 } from "lucide-react";
import { useState } from "react";

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { agents, loading, chatWithAgent } = useAgentContext();
  const [navigatingAgentId, setNavigatingAgentId] = useState<string | null>(
    null
  );

  const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name));

  const isRuntimes = pathname === "/runtimes";
  const isCreateAgent = pathname === "/agents/new";

  const urlAgentId = searchParams.get("agent");
  const activeAgentId = navigatingAgentId ?? urlAgentId;

  const handleAgentClick = async (agentId: string) => {
    setNavigatingAgentId(agentId);
    try {
      const conversationId = await chatWithAgent(agentId);
      if (conversationId) {
        router.push(`/chat/${conversationId}?agent=${agentId}`);
      }
    } finally {
      setNavigatingAgentId(null);
    }
  };

  return (
    <nav className="flex h-full w-14 flex-col items-center py-2 gap-0.5">
      {/* Agent avatars */}
      <div className="flex flex-1 w-full flex-col items-center gap-1.5 overflow-y-auto py-1 scrollbar-none">
        {loading ? (
          <div className="flex items-center justify-center size-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          sorted.map((agent) => {
            const isActive = activeAgentId === agent.id;
            const isNavigating = navigatingAgentId === agent.id;
            return (
              <button
                key={agent.id}
                type="button"
                title={agent.name}
                disabled={isNavigating}
                onClick={() => handleAgentClick(agent.id)}
                className={cn(
                  "relative flex shrink-0 items-center justify-center size-10 rounded-xl text-sm font-medium transition-colors duration-200 cursor-pointer",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-secondary-foreground hover:bg-accent",
                  isNavigating && "opacity-60"
                )}
              >
                {agent.name.charAt(0).toUpperCase()}
              </button>
            );
          })
        )}

        {/* Create agent */}
        <button
          type="button"
          title="New agent"
          onClick={() => router.push("/agents/new")}
          className={cn(
            "flex shrink-0 items-center justify-center size-10 rounded-xl transition-colors duration-200 cursor-pointer",
            "border border-dashed border-foreground/15 text-muted-foreground",
            "hover:border-foreground/30 hover:text-foreground hover:bg-accent",
            isCreateAgent &&
              "border-solid border-foreground/25 bg-accent text-foreground"
          )}
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* Bottom section */}
      <div className="flex flex-col items-center gap-1 pt-2 border-t border-border/50 mt-1">
        <div className="mb-1">
          <Logo size="sm" iconOnly />
        </div>

        <button
          type="button"
          title="Runtimes"
          onClick={() => router.push("/runtimes")}
          className={cn(
            "flex items-center justify-center size-10 rounded-xl transition-colors duration-200 cursor-pointer",
            "text-muted-foreground hover:text-foreground hover:bg-accent",
            isRuntimes && "bg-accent text-foreground"
          )}
        >
          <Monitor className="size-4" />
        </button>

        <button
          type="button"
          title="Sign out"
          onClick={() => {
            localStorage.removeItem("alook_token");
            localStorage.removeItem("alook_workspace_id");
            document.cookie = "alook_session=; path=/; max-age=0";
            router.push("/login");
          }}
          className="flex items-center justify-center size-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200 cursor-pointer"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </nav>
  );
}
