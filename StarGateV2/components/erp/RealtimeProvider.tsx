"use client";

import { useEffect } from "react";

import {
  isRealtimeResource,
  type RealtimeInvalidateV1,
  type RealtimeResource,
} from "@stargate/core/domain/realtime";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";

import { queryKeysForRealtimeResources } from "@/lib/realtime/query-keys";

const RECONNECT_MIN_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

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
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const controller = new AbortController();
    let socket: Socket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const invalidateResources = (resources: readonly RealtimeResource[]) => {
      const queryKeys = queryKeysForRealtimeResources(resources);
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({
          queryKey,
          refetchType: "active",
        });
      }
    };

    const scheduleReconnect = (connect: () => Promise<void>) => {
      if (controller.signal.aborted || reconnectTimer) return;
      const delay = Math.min(
        RECONNECT_MIN_DELAY_MS * 2 ** reconnectAttempts,
        RECONNECT_MAX_DELAY_MS,
      );
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    };

    const connect = async (): Promise<void> => {
      if (controller.signal.aborted) return;

      try {
        const ticket = await requestTicket(controller.signal);
        if (controller.signal.aborted) return;

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
          clearReconnectTimer();
          // 최초 연결 전 DB 변경과 재연결 gap을 모두 닫는다.
          void queryClient.refetchQueries({ type: "active" });
        });
        socket.on("invalidate", (event: unknown) => {
          if (!isRealtimeInvalidateEvent(event)) return;
          invalidateResources(event.resources);
        });
        socket.on("disconnect", () => {
          scheduleReconnect(connect);
        });
        socket.on("connect_error", () => {
          socket?.disconnect();
          scheduleReconnect(connect);
        });
      } catch {
        if (!controller.signal.aborted) scheduleReconnect(connect);
      }
    };

    void connect();

    return () => {
      controller.abort();
      clearReconnectTimer();
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [queryClient]);

  return children;
}
