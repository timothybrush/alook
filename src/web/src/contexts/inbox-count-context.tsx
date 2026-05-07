"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getInboxCount } from "@/lib/api";
import { useAgentContext } from "@/contexts/agent-context";
import { useWorkspace } from "@/contexts/workspace-context";
import type { WsMessage } from "@alook/shared";

interface InboxCountContextValue {
  count: number;
  refresh: () => void;
  decrement: () => void;
}

const InboxCountContext = createContext<InboxCountContextValue | null>(null);

export function useInboxCount() {
  const ctx = useContext(InboxCountContext);
  if (!ctx) throw new Error("useInboxCount must be used within InboxCountProvider");
  return ctx;
}

export function InboxCountProvider({ children }: { children: ReactNode }) {
  const { workspaceId } = useWorkspace();
  const { subscribeWs } = useAgentContext();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    getInboxCount(workspaceId).then((r) => setCount(r.count)).catch(() => {});
  }, [workspaceId]);

  const decrement = useCallback(() => {
    setCount((c) => Math.max(0, c - 1));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    return subscribeWs((msg: WsMessage) => {
      if (msg.type === "task.updated" && (msg.status === "completed" || msg.status === "failed")) {
        refresh();
      }
    });
  }, [subscribeWs, refresh]);

  useEffect(() => {
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <InboxCountContext.Provider value={{ count, refresh, decrement }}>
      {children}
    </InboxCountContext.Provider>
  );
}
