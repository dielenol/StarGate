import { useQuery } from "@tanstack/react-query";

import type { Notification } from "@/types/notification";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: ["notifications", "list"] as const,
  summary: ["notifications", "summary"] as const,
};

export interface NotificationSummaryResponse {
  recent: Notification[];
  unreadCount: number;
}

const NOTIFICATION_STALE_TIME_MS = 30 * 1000;
const NOTIFICATION_REFETCH_INTERVAL_MS = 60 * 1000;

async function fetchNotifications(): Promise<Notification[]> {
  const res = await fetch("/api/erp/notifications", { cache: "no-store" });
  if (!res.ok) throw new Error("알림을 불러올 수 없습니다.");
  const data = await res.json();
  return data.notifications;
}

async function fetchNotificationSummary(): Promise<NotificationSummaryResponse> {
  const res = await fetch("/api/erp/notifications/summary", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("알림 요약을 불러올 수 없습니다.");
  return res.json();
}

export function useNotifications(options?: {
  initialData?: Notification[];
}) {
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: fetchNotifications,
    staleTime: NOTIFICATION_STALE_TIME_MS,
    refetchInterval: NOTIFICATION_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}


export function useNotificationSummary(options?: {
  initialData?: NotificationSummaryResponse;
}) {
  return useQuery({
    queryKey: notificationKeys.summary,
    queryFn: fetchNotificationSummary,
    staleTime: NOTIFICATION_STALE_TIME_MS,
    refetchInterval: NOTIFICATION_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}
