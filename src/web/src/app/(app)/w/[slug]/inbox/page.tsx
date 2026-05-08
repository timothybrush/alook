"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useWorkspace } from "@/contexts/workspace-context";
import { useAgentContext } from "@/contexts/agent-context";
import { listInboxItems, markAllInboxRead, type InboxItem } from "@/lib/api";
import { useInboxCount } from "@/contexts/inbox-count-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox } from "lucide-react";
import { AvatarRenderer, parseAvatarUrl } from "@/components/avatar";
import type { WsMessage } from "@alook/shared";

const INBOX_LIMIT = 30;

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatusDot({ status }: { status: string | null }) {
  const colorClass =
    status === "completed"
      ? "bg-[oklch(0.72_0.19_145)]"
      : status === "failed"
        ? "bg-destructive"
        : "bg-muted-foreground/40";
  return <span className={`size-1.5 rounded-full shrink-0 ${colorClass}`} />;
}

function AgentAvatar({ name, avatarUrl, size = 32 }: { name?: string | null; avatarUrl?: string | null; size?: number }) {
  const config = parseAvatarUrl(avatarUrl);
  if (config) return <AvatarRenderer config={config} size={size} className="rounded-full shrink-0" />;
  return (
    <span
      className="flex items-center justify-center rounded-full bg-secondary text-xs font-medium shrink-0"
      style={{ width: size, height: size }}
    >
      {(name ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

function InboxRow({ item, slug, onClick }: { item: InboxItem; slug: string; onClick?: () => void }) {
  const statusLabel = item.root_task_status === "failed" ? "Failed" : "Completed";

  return (
    <Link
      href={`/w/${slug}/agents/${item.agent_id}?conv=${item.id}`}
      onClick={onClick}
      className="block px-4 py-3 border-b border-border/30 hover:bg-accent/30 transition-colors duration-150 cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <AgentAvatar name={item.agent_name} avatarUrl={item.agent_avatar_url} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-foreground truncate flex-1 min-w-0">
              {item.root_prompt ?? item.title}
            </span>
            <span className="text-xs text-muted-foreground shrink-0 ml-2" title={new Date(item.latest_response_at).toLocaleString()}>
              {relativeTime(item.latest_response_at)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.agent_name && (
              <>
                <span className="text-xs font-medium text-muted-foreground">{item.agent_name}</span>
                <span className="text-muted-foreground/40">&middot;</span>
              </>
            )}
            <StatusDot status={item.root_task_status} />
            <span className="text-xs text-muted-foreground">{statusLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1">
            {item.latest_response}
          </p>
        </div>
      </div>
    </Link>
  );
}

function SkeletonRow({ promptWidth }: { promptWidth: string }) {
  return (
    <div className="px-4 py-3 border-b border-border/30">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-full shrink-0" />
        <div className="flex-1">
          <Skeleton className="h-3.5 rounded" style={{ width: promptWidth }} />
          <div className="flex items-center gap-1.5 mt-1.5">
            <Skeleton className="h-2.5 w-16 rounded" />
            <Skeleton className="h-2.5 w-8 rounded" />
          </div>
          <Skeleton className="h-2.5 w-3/4 rounded mt-1.5" />
        </div>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const { slug, workspaceId } = useWorkspace();
  const { subscribeWs } = useAgentContext();
  const { refresh: refreshInboxCount, decrement: decrementInboxCount } = useInboxCount();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  const loadInitial = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const result = await listInboxItems(workspaceId, { limit: INBOX_LIMIT });
      setItems(result.items);
      setHasMore(result.has_more);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const refreshInboxCountRef = useRef(refreshInboxCount);
  refreshInboxCountRef.current = refreshInboxCount;

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    refreshInboxCountRef.current();
  }, []);

  useEffect(() => {
    return subscribeWs((msg: WsMessage) => {
      if (msg.type === "task.updated" && (msg.status === "completed" || msg.status === "failed")) {
        loadInitial({ silent: true });
      }
    });
  }, [subscribeWs, loadInitial]);

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMore || items.length === 0) return;
    isFetchingRef.current = true;
    setLoadingMore(true);
    try {
      const oldest = items[items.length - 1];
      const result = await listInboxItems(workspaceId, {
        limit: INBOX_LIMIT,
        before: oldest.latest_response_at,
      });
      if (result.items.length === 0) {
        setHasMore(false);
        return;
      }
      setHasMore(result.has_more);
      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const unique = result.items.filter((i) => !existingIds.has(i.id));
        return [...prev, ...unique];
      });
    } finally {
      isFetchingRef.current = false;
      setLoadingMore(false);
    }
  }, [workspaceId, items, hasMore]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (!loadingMore && hasMore && nearBottom) {
      loadMore();
    }
  }, [loadMore, loadingMore, hasMore]);

  const handleMarkAllRead = useCallback(async () => {
    setItems([]);
    setHasMore(false);
    try {
      await markAllInboxRead(workspaceId);
      refreshInboxCount();
    } catch {
      loadInitial();
    }
  }, [workspaceId, loadInitial, refreshInboxCount]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border/50 px-3 md:px-5 py-2.5 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-medium">Inbox</h1>
          <p className="text-xs text-muted-foreground hidden md:block">
            Unread responses from your agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && items.length > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {loading ? (
          <>
            <SkeletonRow promptWidth="60%" />
            <SkeletonRow promptWidth="45%" />
            <SkeletonRow promptWidth="70%" />
            <SkeletonRow promptWidth="55%" />
          </>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-20">
            <Inbox className="size-10 opacity-30" />
            <p className="text-sm">No unread messages</p>
          </div>
        ) : (
          <>
            {items.map((item) => (
              <InboxRow key={item.id} item={item} slug={slug} onClick={decrementInboxCount} />
            ))}
            {loadingMore && <SkeletonRow promptWidth="50%" />}
          </>
        )}
      </div>
    </div>
  );
}
