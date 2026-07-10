import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { listUserNotifications } from "@/lib/db/notifications";

import type { Notification } from "@/types/notification";

import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const notifications = await listUserNotifications(session.user.id).catch(
    (): Notification[] => [],
  );

  return <NotificationsClient initialNotifications={notifications} />;
}
