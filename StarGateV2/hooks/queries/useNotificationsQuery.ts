import { useQuery } from "@tanstack/react-query";

import type { Notification } from "@/types/notification";

export const notificationKeys = {
  all: ["notifications"] as const,
};

async function fetchNotifications(): Promise<Notification[]> {
  const res = await fetch("/api/erp/notifications");
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
    staleTime: 30 * 1000,
    initialData: options?.initialData,
  });
}
