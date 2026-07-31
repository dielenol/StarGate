"use client";

import { useEffect, useMemo, useState } from "react";

import {
  isRealtimeResource,
  REALTIME_RESOURCES,
  type RealtimeInvalidateV1,
  type RealtimeResource,
  type RealtimeSessionRefreshV1,
} from "@stargate/core/domain/realtime";
import { useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";

import {
  RealtimeClientContextProvider,
  type RealtimeClientMode,
  type RealtimeConnectionState,
} from "@/lib/realtime/client-context";
import { queryKeysForRealtimeResources } from "@/lib/realtime/query-keys";

import RealtimeNotificationToasts from "./RealtimeNotificationToasts";

const RECONNECT_MIN_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const INVALIDATION_BATCH_MS = 100;
const RECENT_EVENT_ID_LIMIT = 256;

interface RealtimeTicketResponse {
  token: string;
  expiresAt: string;
  socketUrl: string;
}

function isRealtimeInvalidateEvent(
  value: unknown,
): value is RealtimeInvalidateV1 {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<RealtimeInvalidateV1>;
  return (
    event.version === 1 &&
    event.type === "invalidate" &&
    typeof event.id === "string" &&
    typeof event.emittedAt === "string" &&
    Array.isArray(event.resources) &&
    event.resources.length > 0 &&
    event.resources.every(isRealtimeResource)
  );
}

function isRealtimeSessionRefreshEvent(
  value: unknown,
): value is RealtimeSessionRefreshV1 {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<RealtimeSessionRefreshV1>;
  return (
    event.version === 1 &&
    event.type === "session-refresh" &&
    event.reason === "identity-changed" &&
    typeof event.id === "string" &&
    typeof event.emittedAt === "string"
  );
}

async function requestTicket(
  signal: AbortSignal,
): Promise<RealtimeTicketResponse> {
  const response = await fetch("/api/erp/realtime/ticket", {
    method: "POST",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`realtime ticket request failed (${response.status})`);
  }
  return response.json() as Promise<RealtimeTicketResponse>;
}

export default function RealtimeProvider({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: RealtimeClientMode;
}) {
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>(
      mode === "off" ? "disabled" : "connecting",
    );

  useEffect(() => {
    if (mode === "off") return;

    const controller = new AbortController();
    let disposed = false;
    let socket: Socket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let invalidationTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let gapRefetched = false;
    const pendingResources = new Set<RealtimeResource>();
    const recentEventIds = new Set<string>();
    const recentEventIdQueue: string[] = [];

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const rememberEvent = (eventId: string): boolean => {
      if (recentEventIds.has(eventId)) return false;
      recentEventIds.add(eventId);
      recentEventIdQueue.push(eventId);
      if (recentEventIdQueue.length > RECENT_EVENT_ID_LIMIT) {
        const oldest = recentEventIdQueue.shift();
        if (oldest) recentEventIds.delete(oldest);
      }
      return true;
    };

    const flushInvalidations = () => {
      invalidationTimer = null;
      const resources = [...pendingResources];
      pendingResources.clear();
      const queryKeys = queryKeysForRealtimeResources(resources);
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({
          queryKey,
          refetchType: "active",
        });
      }
    };

    const enqueueInvalidation = (
      resources: readonly RealtimeResource[],
    ) => {
      for (const resource of resources) pendingResources.add(resource);
      if (invalidationTimer) return;
      invalidationTimer = setTimeout(
        flushInvalidations,
        INVALIDATION_BATCH_MS,
      );
    };

    // 갭 복구는 realtime 매핑 리소스의 쿼리 키로만 한정한다 (전체 active refetch 금지).
    const refetchRealtimeMappedQueries = () => {
      const queryKeys = queryKeysForRealtimeResources(REALTIME_RESOURCES);
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({
          queryKey,
          refetchType: "active",
        });
      }
    };

    const enterDegraded = () => {
      setConnectionState("degraded");
      if (gapRefetched) return;
      gapRefetched = true;
      if (invalidationTimer) {
        clearTimeout(invalidationTimer);
        invalidationTimer = null;
        pendingResources.clear();
      }
      refetchRealtimeMappedQueries();
    };

    const scheduleReconnect = (connect: () => Promise<void>) => {
      if (controller.signal.aborted || reconnectTimer) return;
      const baseDelay = Math.min(
        RECONNECT_MIN_DELAY_MS * 2 ** reconnectAttempts,
        RECONNECT_MAX_DELAY_MS,
      );
      const delay = Math.round(baseDelay * (0.75 + Math.random() * 0.5));
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    };

    const connect = async (): Promise<void> => {
      if (controller.signal.aborted) return;
      setConnectionState("connecting");

      try {
        // socket.io-client 는 ERP 초기 번들에서 제외하고 첫 연결 시점에 로드한다.
        const [{ io }, ticket] = await Promise.all([
          import("socket.io-client"),
          requestTicket(controller.signal),
        ]);
        if (disposed || controller.signal.aborted) return;

        socket?.removeAllListeners();
        socket?.disconnect();
        socket = io(`${ticket.socketUrl}/erp`, {
          auth: { token: ticket.token },
          transports: ["websocket"],
          upgrade: false,
          reconnection: false,
        });

        socket.on("connect", () => {
          reconnectAttempts = 0;
          gapRefetched = false;
          clearReconnectTimer();
          setConnectionState("connected");
          // 최초 연결 전 DB 변경과 재연결 gap을 모두 닫는다.
          refetchRealtimeMappedQueries();
        });
        socket.on("invalidate", (event: unknown) => {
          if (!isRealtimeInvalidateEvent(event)) return;
          if (!rememberEvent(event.id)) return;
          enqueueInvalidation(event.resources);
        });
        socket.on("session-refresh", (event: unknown) => {
          if (!isRealtimeSessionRefreshEvent(event)) return;
          if (!rememberEvent(event.id)) return;
          setConnectionState("degraded");
          window.location.reload();
        });
        socket.on("disconnect", () => {
          enterDegraded();
          scheduleReconnect(connect);
        });
        socket.on("connect_error", () => {
          enterDegraded();
          socket?.disconnect();
          scheduleReconnect(connect);
        });
      } catch {
        if (!controller.signal.aborted) {
          enterDegraded();
          scheduleReconnect(connect);
        }
      }
    };

    void connect();

    return () => {
      disposed = true;
      controller.abort();
      clearReconnectTimer();
      if (invalidationTimer) clearTimeout(invalidationTimer);
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [mode, queryClient]);

  const contextValue = useMemo(
    () => ({ mode, state: connectionState }),
    [connectionState, mode],
  );

  return (
    <RealtimeClientContextProvider value={contextValue}>
      {children}
      <RealtimeNotificationToasts />
    </RealtimeClientContextProvider>
  );
}
