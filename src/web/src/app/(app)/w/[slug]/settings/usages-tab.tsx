"use client";

import { useEffect, useState } from "react";
import { useAgentContext } from "@/contexts/agent-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkspaceOverview, type WorkspaceOverview } from "@/lib/api";
import { QuickStatsRow } from "../home/_components/quick-stats";
import { TaskHealth } from "../home/_components/task-health";
import { EmailSummary } from "../home/_components/email-summary";
import { RuntimeHealth } from "../home/_components/runtime-health";
import { TeamAccess } from "../home/_components/team-access";

export function UsagesTab() {
  const { agents, runtimes, loading, activeTaskCounts } = useAgentContext();
  const { workspaceId } = useWorkspace();
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setOverviewLoading(true);
    getWorkspaceOverview(workspaceId)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => { cancelled = true; };
  }, [loading, workspaceId]);

  if (overviewLoading || !overview) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <QuickStatsRow
        agents={agents}
        runtimes={runtimes}
        activeTaskCounts={activeTaskCounts}
        overview={overview}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <TaskHealth overview={overview} />
        <EmailSummary overview={overview} agents={agents} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RuntimeHealth runtimes={runtimes} agents={agents} />
        <TeamAccess overview={overview} />
      </div>
    </div>
  );
}
