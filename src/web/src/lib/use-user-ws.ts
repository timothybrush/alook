"use client"
import { useEffect, useRef, useCallback } from "react"
import type { WsMessage } from "@alook/shared"

const isDev = process.env.NODE_ENV === "development"
const WS_DO_PORT = Number(process.env.NEXT_PUBLIC_WS_DO_PORT) || 8789
const WS_RECONNECT_INIT = Number(process.env.NEXT_PUBLIC_WS_RECONNECT_DELAY_MS) || 1000
const WS_RECONNECT_MAX = Number(process.env.NEXT_PUBLIC_WS_RECONNECT_MAX_DELAY_MS) || 30_000

export function useUserWs(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(WS_RECONNECT_INIT)
  const onMessageRef = useRef(onMessage)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the ref in sync with the latest callback on every render
  onMessageRef.current = onMessage

  const connect = useCallback(async () => {
    // Unified flow for dev and prod:
    //   1. Fetch /api/ws/token over HTTP (cookie-authenticated Next.js route).
    //   2. Open WebSocket with ?userId= and authenticate via {type:"auth",token}.
    // The custom OpenNext wrapper (src/web/custom-worker.ts) forwards /api/ws/*
    // upgrade requests directly to the ws-do worker in prod; in dev we connect
    // to the ws-do worker on localhost directly.
    let userId: string
    let authToken: string
    try {
      const res = await fetch("/api/ws/token")
      if (!res.ok) return
      const body = await res.json() as { userId: string; token: string }
      userId = body.userId
      authToken = body.token
    } catch {
      return
    }

    const url = isDev
      ? `ws://localhost:${WS_DO_PORT}/?userId=${userId}`
      : `${location.origin.replace("http", "ws")}/api/ws/user?userId=${userId}`

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      reconnectDelay.current = WS_RECONNECT_INIT
      ws.send(JSON.stringify({ type: "auth", token: authToken }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === "auth.ok") return
        onMessageRef.current(msg as WsMessage)
      } catch {}
    }

    ws.onerror = () => {}

    ws.onclose = () => {
      // Ownership check: only reconnect if this WS is still the current one.
      // If effect cleanup already replaced wsRef.current, this is an orphan — skip.
      if (ws !== wsRef.current) return

      const delay = Math.min(reconnectDelay.current, WS_RECONNECT_MAX)
      reconnectDelay.current = Math.min(delay * 2, WS_RECONNECT_MAX)
      reconnectTimerRef.current = setTimeout(connect, delay + Math.random() * 500)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      // Clear any pending reconnect timer first
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      // Nullify wsRef BEFORE closing so the onclose handler's ownership check fails
      const ws = wsRef.current
      wsRef.current = null
      ws?.close()
    }
  }, [connect])
}
