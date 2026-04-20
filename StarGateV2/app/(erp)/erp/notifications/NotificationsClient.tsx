"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useNotifications } from "@/hooks/queries/useNotificationsQuery";

import type { Notification, NotificationType } from "@/types/notification";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import NotificationActions from "./NotificationActions";

import styles from "./page.module.css";

type FilterKey = "ALL" | NotificationType;

const FILTER_ORDER: FilterKey[] = [
  "ALL",
  "SESSION_REMIND",
  "CREDIT_RECEIVED",
  "REPORT_PUBLISHED",
  "ROLE_CHANGE",
  "SYSTEM",
];

const FILTER_LABEL: Record<FilterKey, string> = {
  ALL: "전체",
  SESSION_REMIND: "세션",
  CREDIT_RECEIVED: "크레딧",
  REPORT_PUBLISHED: "리포트",
  ROLE_CHANGE: "역할",
  SYSTEM: "시스템",
};

const TYPE_TAG: Record<
  NotificationType,
  { label: string; tone: "gold" | "info" | "success" | "danger" | "default" }
> = {
  SESSION_REMIND: { label: "SESSION", tone: "gold" },
  ROLE_CHANGE: { label: "ROLE", tone: "info" },
  CREDIT_RECEIVED: { label: "CREDITS", tone: "success" },
  REPORT_PUBLISHED: { label: "REPORT", tone: "gold" },
  SYSTEM: { label: "SYSTEM", tone: "default" },
};

function fmtTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (isToday) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

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

  const [filter, setFilter] = useState<FilterKey>("ALL");

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const countsByType = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      ALL: notifications.length,
      SESSION_REMIND: 0,
      ROLE_CHANGE: 0,
      CREDIT_RECEIVED: 0,
      REPORT_PUBLISHED: 0,
      SYSTEM: 0,
    };
    for (const n of notifications) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    }
    return counts;
  }, [notifications]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return notifications;
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  return (
    <>
      <PageHead
        breadcrumb="ERP / NOTIFICATIONS"
        title={
          <>
            알림
            {unreadCount > 0 ? (
              <span className={styles.unreadBadge}>{unreadCount}</span>
            ) : null}
          </>
        }
        right={
          unreadCount > 0 ? <NotificationActions /> : null
        }
      />

      <div className={styles.tabs}>
        {FILTER_ORDER.map((key) => {
          const count = countsByType[key] ?? 0;
          if (key !== "ALL" && count === 0) return null;
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              className={[styles.tab, active ? styles["tab--active"] : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setFilter(key)}
            >
              {FILTER_LABEL[key]} · {count}
            </button>
          );
        })}
      </div>

      <Box>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {initialUnreadCount > 0 || notifications.length > 0
              ? "해당 분류의 알림이 없습니다."
              : "알림이 없습니다."}
          </div>
        ) : (
          <div className={styles.list}>
            {filtered.map((n) => {
              const meta = TYPE_TAG[n.type];
              return (
                <div
                  key={String(n._id)}
                  className={[styles.notif, n.isRead ? styles["notif--read"] : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className={styles.notif__mark} aria-hidden />
                  <div className={styles.notif__body}>
                    <div className={styles.notif__head}>
                      <div className={styles.notif__headLeft}>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                        <span className={styles.notif__title}>{n.title}</span>
                      </div>
                      <span className={styles.notif__time}>
                        {fmtTime(n.createdAt)}
                      </span>
                    </div>
                    {n.message ? (
                      <div className={styles.notif__message}>{n.message}</div>
                    ) : null}
                    <div className={styles.notif__footer}>
                      {n.link ? (
                        <Link href={n.link} className={styles.notif__link}>
                          바로가기 →
                        </Link>
                      ) : null}
                      {!n.isRead ? (
                        <NotificationActions
                          notificationId={String(n._id)}
                          mode="single"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Box>
    </>
  );
}
