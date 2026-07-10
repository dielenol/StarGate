"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useNotifications } from "@/hooks/queries/useNotificationsQuery";

import type { Notification, NotificationType } from "@/types/notification";

import {
  IconConsumable,
  IconCredit,
  IconGridAll,
  IconInbox,
  IconLinked,
  IconNotification,
  IconRead,
  IconReportMini,
  IconSearch,
  IconSession,
  IconSystem,
  IconToday,
  IconUnread,
  IconUserAdmin,
  type IconComponent,
} from "@/components/icons";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import NotificationActions from "./NotificationActions";

import styles from "./page.module.css";

type FilterKey = "ALL" | NotificationType;
type StatusFilter = "ALL" | "UNREAD" | "READ";

const FILTER_ORDER: FilterKey[] = [
  "ALL",
  "SESSION_REMIND",
  "CONSUMABLE_USED",
  "CREDIT_RECEIVED",
  "REPORT_PUBLISHED",
  "ROLE_CHANGE",
  "SYSTEM",
];

const FILTER_LABEL: Record<FilterKey, string> = {
  ALL: "전체",
  SESSION_REMIND: "세션",
  CONSUMABLE_USED: "소모품",
  CREDIT_RECEIVED: "크레딧",
  REPORT_PUBLISHED: "리포트",
  ROLE_CHANGE: "역할",
  SYSTEM: "시스템",
};

const FILTER_ICON: Record<FilterKey, IconComponent> = {
  ALL: IconGridAll,
  SESSION_REMIND: IconSession,
  CONSUMABLE_USED: IconConsumable,
  CREDIT_RECEIVED: IconCredit,
  REPORT_PUBLISHED: IconReportMini,
  ROLE_CHANGE: IconUserAdmin,
  SYSTEM: IconSystem,
};

const TYPE_TAG: Record<
  NotificationType,
  { label: string; tone: "gold" | "info" | "success" | "danger" | "default" }
> = {
  SESSION_REMIND: { label: "SESSION", tone: "gold" },
  CONSUMABLE_USED: { label: "ITEM", tone: "info" },
  ROLE_CHANGE: { label: "ROLE", tone: "info" },
  CREDIT_RECEIVED: { label: "CREDITS", tone: "success" },
  REPORT_PUBLISHED: { label: "REPORT", tone: "gold" },
  SYSTEM: { label: "SYSTEM", tone: "default" },
};

const STATUS_FILTERS: Array<{
  key: StatusFilter;
  label: string;
  icon: IconComponent;
}> = [
  { key: "ALL", label: "전체", icon: IconGridAll },
  { key: "UNREAD", label: "안 읽음", icon: IconUnread },
  { key: "READ", label: "읽음", icon: IconRead },
];

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

function formatLongDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getDateGroupLabel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "TODAY";
  if (isSameDay(date, yesterday)) return "YESTERDAY";
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function getDateGroupKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date | string): boolean {
  const date = typeof d === "string" ? new Date(d) : d;
  return isSameDay(date, new Date());
}

function matchesSearch(notification: Notification, query: string): boolean {
  if (!query) return true;
  const haystack = `${notification.title} ${notification.message}`.toLowerCase();
  return haystack.includes(query);
}

interface Props {
  initialNotifications: Notification[];
}

export default function NotificationsClient({
  initialNotifications,
}: Props) {
  const { data: notifications = [] } = useNotifications({
    initialData: initialNotifications,
  });

  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const readCount = notifications.length - unreadCount;
  const todayCount = notifications.filter((n) => isToday(n.createdAt)).length;
  const linkedCount = notifications.filter((n) => n.link).length;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const hasActiveFilter =
    filter !== "ALL" || statusFilter !== "ALL" || normalizedSearch.length > 0;

  function resetFilters() {
    setFilter("ALL");
    setStatusFilter("ALL");
    setSearchQuery("");
  }

  const countsByType = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      ALL: notifications.length,
      SESSION_REMIND: 0,
      CONSUMABLE_USED: 0,
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
    return notifications.filter((n) => {
      if (filter !== "ALL" && n.type !== filter) return false;
      if (statusFilter === "UNREAD" && n.isRead) return false;
      if (statusFilter === "READ" && !n.isRead) return false;
      return matchesSearch(n, normalizedSearch);
    });
  }, [notifications, filter, statusFilter, normalizedSearch]);

  const grouped = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      notifications: Notification[];
    }> = [];
    const groupIndex = new Map<string, number>();

    for (const notification of filtered) {
      const key = getDateGroupKey(notification.createdAt);
      const existingIndex = groupIndex.get(key);
      if (existingIndex !== undefined) {
        groups[existingIndex].notifications.push(notification);
        continue;
      }

      groupIndex.set(key, groups.length);
      groups.push({
        key,
        label: getDateGroupLabel(notification.createdAt),
        notifications: [notification],
      });
    }

    return groups;
  }, [filtered]);

  return (
    <div className={styles.notificationsShell} data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "NOTIFICATIONS" },
        ]}
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

      <section className={styles.summaryGrid} aria-label="알림 요약">
        <div className={styles.summaryItem}>
          <span className={styles.summaryItem__label}>
            <IconNotification className={styles.summaryItem__icon} aria-hidden />
            TOTAL
          </span>
          <strong className={styles.summaryItem__value}>
            {notifications.length}
          </strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryItem__label}>
            <IconUnread className={styles.summaryItem__icon} aria-hidden />
            UNREAD
          </span>
          <strong className={styles.summaryItem__valueGold}>
            {unreadCount}
          </strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryItem__label}>
            <IconToday className={styles.summaryItem__icon} aria-hidden />
            TODAY
          </span>
          <strong className={styles.summaryItem__value}>{todayCount}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryItem__label}>
            <IconLinked className={styles.summaryItem__icon} aria-hidden />
            LINKED
          </span>
          <strong className={styles.summaryItem__value}>{linkedCount}</strong>
        </div>
      </section>

      <section className={styles.controlPanel} aria-label="알림 필터">
        <div className={styles.toolbar}>
          <div className={styles.statusFilters} aria-label="읽음 상태 필터">
            {STATUS_FILTERS.map(({ key, label, icon: FilterIcon }) => {
              const active = statusFilter === key;
              const count =
                key === "UNREAD"
                  ? unreadCount
                  : key === "READ"
                    ? readCount
                    : notifications.length;
              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    styles.statusFilter,
                    active ? styles["statusFilter--active"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setStatusFilter(key)}
                >
                  <FilterIcon className={styles.statusFilter__icon} aria-hidden />
                  <span>{label}</span>
                  <span className={styles.statusFilter__count}>{count}</span>
                </button>
              );
            })}
          </div>
          <label className={styles.search}>
            <span className={styles.search__label}>
              <IconSearch className={styles.search__icon} aria-hidden />
              SEARCH
            </span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="제목 또는 메시지"
              className={styles.search__input}
            />
          </label>
        </div>

        <div className={styles.tabs}>
          {FILTER_ORDER.map((key) => {
            const count = countsByType[key] ?? 0;
            if (key !== "ALL" && count === 0) return null;
            const active = filter === key;
            const TabIcon = FILTER_ICON[key];
            return (
              <button
                key={key}
                type="button"
                className={[styles.tab, active ? styles["tab--active"] : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setFilter(key)}
              >
                <TabIcon className={styles.tab__icon} aria-hidden />
                <span>
                  {FILTER_LABEL[key]} · {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.feedPanel} aria-label="알림 목록">
        <div className={styles.feedPanel__head}>
          <span className={styles.feedPanel__title}>
            <IconInbox className={styles.feedPanel__icon} aria-hidden />
            SIGNAL FEED
          </span>
          <span className={styles.feedPanel__meta}>
            <span>
              {filtered.length} / {notifications.length}
            </span>
            {unreadCount > 0 ? <NotificationActions size="sm" /> : null}
          </span>
        </div>
        {grouped.length === 0 ? (
          <div className={styles.empty}>
            <span>
              {notifications.length > 0
                ? "조건에 맞는 알림이 없습니다."
                : "알림이 없습니다."}
            </span>
            {hasActiveFilter ? (
              <button
                type="button"
                className={styles.resetFilters}
                onClick={resetFilters}
              >
                필터 초기화
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.list}>
            {grouped.map((group) => (
              <section key={group.key} className={styles.group}>
                <div className={styles.group__head}>
                  <span>{group.label}</span>
                  <span>{group.notifications.length}</span>
                </div>
                {group.notifications.map((n) => {
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
                            <span className={styles.notif__status}>
                              {n.isRead ? "READ" : "UNREAD"}
                            </span>
                            <span className={styles.notif__title}>{n.title}</span>
                          </div>
                          <span
                            className={styles.notif__time}
                            title={formatLongDate(n.createdAt)}
                          >
                            {fmtTime(n.createdAt)}
                          </span>
                        </div>
                        {n.message ? (
                          <div className={styles.notif__message}>{n.message}</div>
                        ) : null}
                        <div className={styles.notif__footer}>
                          {n.link ? (
                            <Link href={n.link} className={styles.notif__link}>
                              열기 →
                            </Link>
                          ) : (
                            <span className={styles.notif__muted}>연결 링크 없음</span>
                          )}
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
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
