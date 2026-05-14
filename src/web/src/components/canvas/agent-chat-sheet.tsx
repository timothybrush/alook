"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Agent } from "@alook/shared";
import { AnimatedAvatar, parseAvatarUrl } from "@/components/avatar";
import { useAgentContext } from "@/contexts/agent-context";
import { ChannelBar } from "@/components/channel-bar";
import { AgentChatView } from "@/components/agent-chat/agent-chat-view";

interface AgentChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent | null;
}

const MIN_WIDTH = 320;
const MAX_WIDTH_RATIO = 0.8;
const DEFAULT_WIDTH = 480;

export function AgentChatSheet({ open, onOpenChange, agent }: AgentChatSheetProps) {
  const { runtimes, activeTaskCounts } = useAgentContext();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const maxW = window.innerWidth * MAX_WIDTH_RATIO;
    setWidth(Math.min(maxW, Math.max(MIN_WIDTH, window.innerWidth - e.clientX)));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        style={{ width: `min(${width}px, 100vw)`, maxWidth: "none" }}
        className="data-[side=right]:sm:inset-y-2 data-[side=right]:sm:right-2 data-[side=right]:sm:h-auto data-[side=right]:sm:rounded-xl data-[side=right]:sm:border flex flex-col"
      >
        {/* Resize handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="hidden sm:block absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors rounded-l-xl"
        />

        <SheetHeader>
          <div className="flex items-center gap-3">
            {agent && (() => {
              const avatarConfig = parseAvatarUrl(agent.avatar_url);
              const rt = runtimes.find((r) => r.id === agent.runtime_id);
              const isOnline = rt?.status === "online";
              const isWorking = !!isOnline && (activeTaskCounts[agent.id] ?? 0) > 0;
              return avatarConfig ? (
                <AnimatedAvatar config={avatarConfig} size={28} className="shrink-0 rounded-lg" isHovered={false} isWorking={isWorking} />
              ) : null;
            })()}
            <div className="flex items-baseline gap-2 min-w-0">
              <SheetTitle className="truncate shrink-0">
                {agent?.name ?? "Chat"}
              </SheetTitle>
              {agent?.email_handle && (
                <span className="text-xs text-muted-foreground truncate">{agent.email_handle}@alook.ai</span>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 pb-2">
          <ChannelBar />
        </div>

        {agent && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <AgentChatView agentId={agent.id} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
