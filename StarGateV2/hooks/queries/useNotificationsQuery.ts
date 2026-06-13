import { useQuery } from "@tanstack/react-query";

import type { Notification } from "@/types/notification";

export const notificationKeys = {
  all: ["notifications"] as const,
};

const NOTIFICATION_STALE_TIME_MS = 30 * 1000;
const NOTIFICATION_REFETCH_INTERVAL_MS = 60 * 1000;

async function fetchNotifications(): Promise<Notification[]> {
  const res = await fetch("/api/erp/notifications", { cache: "no-store" });
  if (!res.ok) throw new Error("알림을 불러올 수 없습니다.");
  const data = await res.json();
  return data.notifications;
}

export function useNotifications(options?: {
  initialData?: Notification[];
}) {
  return useQuery({
    queryKey: notificationKeys.all,
    queryFn: fetchNotifications,
    staleTime: NOTIFICATION_STALE_TIME_MS,
    refetchInterval: NOTIFICATION_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}
