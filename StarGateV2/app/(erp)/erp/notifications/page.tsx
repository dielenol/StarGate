import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { listUserNotifications } from "@/lib/db/notifications";

import type { ClientNotification, Notification } from "@/types/notification";

import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const notifications = await listUserNotifications(session.user.id).catch(
    (): Notification[] => [],
  );
  const initialNotifications: ClientNotification[] = notifications.map(
    ({ _id, createdAt, ...notification }) => {
      if (!_id) {
        throw new Error("저장된 알림에 _id가 없습니다.");
      }
      return {
        ...notification,
        _id: _id.toString(),
        createdAt: createdAt.toISOString(),
      };
    },
  );

  return (
    <NotificationsClient
      initialNotifications={initialNotifications}
      initialNow={new Date().toISOString()}
    />
  );
}
