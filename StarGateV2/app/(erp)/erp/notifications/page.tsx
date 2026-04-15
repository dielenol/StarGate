import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { countUnread, listUserNotifications } from "@/lib/db/notifications";

import type { Notification } from "@/types/notification";

import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const [notifications, unreadCount] = await Promise.all([
    listUserNotifications(session.user.id).catch((): Notification[] => []),
    countUnread(session.user.id).catch(() => 0),
  ]);

  return (
    <NotificationsClient
      initialNotifications={notifications}
      initialUnreadCount={unreadCount}
    />
  );
}
