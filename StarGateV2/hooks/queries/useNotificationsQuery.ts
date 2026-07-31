import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type { ClientNotification } from "@/types/notification";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: ["notifications", "list"] as const,
  summary: ["notifications", "summary"] as const,
};

export interface NotificationSummaryResponse {
  recent: ClientNotification[];
  unreadCount: number;
}

const NOTIFICATION_STALE_TIME_MS = 30 * 1000;
const NOTIFICATION_REFETCH_INTERVAL_MS = 60 * 1000;

async function fetchNotifications(): Promise<ClientNotification[]> {
  // no-cache = ETag 재검증 허용 (304 시 브라우저 캐시 재사용)
  const res = await fetch("/api/erp/notifications", { cache: "no-cache" });
  if (!res.ok) throw new Error("알림을 불러올 수 없습니다.");
  const data = await res.json();
  return data.notifications;
}

async function fetchNotificationSummary(): Promise<NotificationSummaryResponse> {
  const res = await fetch("/api/erp/notifications/summary", {
    // no-cache = ETag 재검증 허용 (304 시 브라우저 캐시 재사용)
    cache: "no-cache",
  });
  if (!res.ok) throw new Error("알림 요약을 불러올 수 없습니다.");
  return res.json();
}

export function useNotifications(options?: {
  initialData?: ClientNotification[];
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    NOTIFICATION_REFETCH_INTERVAL_MS,
  );
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: fetchNotifications,
    staleTime: NOTIFICATION_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}


export function useNotificationSummary(options?: {
  initialData?: NotificationSummaryResponse;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    NOTIFICATION_REFETCH_INTERVAL_MS,
  );
  return useQuery({
    queryKey: notificationKeys.summary,
    queryFn: fetchNotificationSummary,
    staleTime: NOTIFICATION_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}
