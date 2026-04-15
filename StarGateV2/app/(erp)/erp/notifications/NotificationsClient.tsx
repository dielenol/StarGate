"use client";

import type { Notification, NotificationType } from "@/types/notification";

import { useNotifications } from "@/hooks/queries/useNotificationsQuery";

import NotificationActions from "./NotificationActions";

import styles from "./page.module.css";

const TYPE_ICONS: Record<NotificationType, string> = {
  SESSION_REMIND: "\u25C9",
  ROLE_CHANGE: "\u2699",
  CREDIT_RECEIVED: "\u25C8",
  REPORT_PUBLISHED: "\u25CE",
  SYSTEM: "\u26A1",
};

interface Props {
  initialNotifications: Notification[];
  initialUnreadCount: number;
}

export default function NotificationsClient({
  initialNotifications,
  initialUnreadCount,
}: Props) {
  const { data: notifications = [] } = useNotifications({
    initialData: initialNotifications,
  });

  const unreadCount =
    notifications.filter((n) => !n.isRead).length ?? initialUnreadCount;

  return (
    <section className={styles.notif}>
      <div className={styles.notif__classification}>NOTIFICATIONS</div>

      <div className={styles.notif__header}>
        <h1 className={styles.notif__title}>
          알림
          {unreadCount > 0 && (
            <span className={styles.notif__unreadBadge}>{unreadCount}</span>
          )}
        </h1>
        {unreadCount > 0 && <NotificationActions />}
      </div>

      {notifications.length === 0 ? (
        <p className={styles.notif__empty}>알림이 없습니다.</p>
      ) : (
        <div className={styles.notif__list}>
          {notifications.map((n) => (
            <div
              key={String(n._id)}
              className={`${styles.notif__card} ${n.isRead ? styles["notif__card--read"] : ""}`}
            >
              <span className={styles.notif__icon}>
                {TYPE_ICONS[n.type] ?? "\u26A1"}
              </span>
              <div className={styles.notif__content}>
                <div className={styles.notif__cardHeader}>
                  <span className={styles.notif__cardTitle}>{n.title}</span>
                  <span className={styles.notif__cardDate}>
                    {new Date(n.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                <p className={styles.notif__cardMessage}>{n.message}</p>
                <div className={styles.notif__cardFooter}>
                  {n.link && (
                    <a href={n.link} className={styles.notif__link}>
                      바로가기 &rarr;
                    </a>
                  )}
                  {!n.isRead && (
                    <NotificationActions
                      notificationId={String(n._id)}
                      mode="single"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
