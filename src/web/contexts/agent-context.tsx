"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  listAgents,
  listRuntimes,
  createAgent,
  updateAgent,
  deleteAgent,
  createConversation,
  createMachineToken,
  deleteMachine,
} from "@/lib/api";
import { toast } from "sonner";
import type {
  Agent,
  Runtime,
  CreateAgentRequest,
  UpdateAgentRequest,
} from "@/lib/types";

interface AgentContextValue {
  agents: Agent[];
  runtimes: Runtime[];
  loading: boolean;
  reload: () => Promise<void>;
  handleCreateAgent: (req: CreateAgentRequest) => Promise<Agent | null>;
  handleUpdateAgent: (id: string, req: UpdateAgentRequest) => Promise<boolean>;
  handleDeleteAgent: (id: string) => Promise<boolean>;
  chatWithAgent: (agentId: string) => Promise<string | null>;
  getFirstOnlineRuntimeId: () => string;
  handleGenerateToken: () => Promise<string | null>;
  handleDeleteMachine: (daemonId: string) => Promise<boolean>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgentContext() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgentContext must be used within AgentProvider");
  return ctx;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const reload = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([listAgents(), listRuntimes()]);
      setAgents(a);
      setRuntimes(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCreateAgent = useCallback(
    async (req: CreateAgentRequest): Promise<Agent | null> => {
      try {
        const agent = await createAgent(req);
        await reload();
        return agent;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to create agent"
        );
        return null;
      }
    },
    [reload]
  );

  const handleUpdateAgent = useCallback(
    async (id: string, req: UpdateAgentRequest): Promise<boolean> => {
      try {
        await updateAgent(id, req);
        await reload();
        return true;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to update agent"
        );
        return false;
      }
    },
    [reload]
  );

  const handleDeleteAgent = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await deleteAgent(id);
        await reload();
        return true;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to remove agent"
        );
        return false;
      }
    },
    [reload]
  );

  const chatWithAgent = useCallback(
    async (agentId: string): Promise<string | null> => {
      try {
        const conversation = await createConversation(agentId);
        return conversation.id;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to start conversation"
        );
        return null;
      }
    },
    []
  );

  const getFirstOnlineRuntimeId = useCallback(() => {
    const first = runtimes.find((r) => r.status === "online");
    return first?.id ?? "";
  }, [runtimes]);

  const handleGenerateToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await createMachineToken("cli");
      return res.token;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate token"
      );
      return null;
    }
  }, []);

  const handleDeleteMachine = useCallback(
    async (daemonId: string): Promise<boolean> => {
      try {
        await deleteMachine(daemonId);
        await reload();
        return true;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to remove machine"
        );
        return false;
      }
    },
    [reload]
  );

  return (
    <AgentContext.Provider
      value={{
        agents,
        runtimes,
        loading,
        reload,
        handleCreateAgent,
        handleUpdateAgent,
        handleDeleteAgent,
        chatWithAgent,
        getFirstOnlineRuntimeId,
        handleGenerateToken,
        handleDeleteMachine,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}
