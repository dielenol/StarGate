"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useNotificationSummary } from "@/hooks/queries/useNotificationsQuery";

import styles from "./RealtimeNotificationToasts.module.css";

const TOAST_DURATION_MS = 6_000;
const MAX_INDIVIDUAL_TOASTS = 3;

interface NotificationToast {
  id: string;
  title: string;
  message: string;
  link: string;
}

export default function RealtimeNotificationToasts() {
  const { data } = useNotificationSummary();
  const initializedRef = useRef(false);
  const seenIdsRef = useRef(new Set<string>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [toasts, setToasts] = useState<NotificationToast[]>([]);

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!data) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
      for (const notification of data.recent) {
        seenIdsRef.current.add(notification._id);
      }
      return;
    }

    const incoming = data.recent.filter(
      (notification) => !seenIdsRef.current.has(notification._id),
    );
    for (const notification of incoming) {
      seenIdsRef.current.add(notification._id);
    }
    if (incoming.length === 0) return;

    const nextToasts: NotificationToast[] =
      incoming.length > MAX_INDIVIDUAL_TOASTS
        ? [
            {
              id: `burst:${incoming.map(({ _id }) => _id).join(",")}`,
              title: `새 알림 ${incoming.length}건`,
              message: "알림 센터에서 새 소식을 확인하세요.",
              link: "/erp/notifications",
            },
          ]
        : incoming.slice(0, MAX_INDIVIDUAL_TOASTS).map((notification) => ({
            id: notification._id,
            title: notification.title,
            message: notification.message,
            link: notification.link ?? "/erp/notifications",
          }));

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setToasts((current) =>
        [...current, ...nextToasts].slice(-MAX_INDIVIDUAL_TOASTS),
      );
      for (const toast of nextToasts) {
        const timer = setTimeout(
          () => dismiss(toast.id),
          TOAST_DURATION_MS,
        );
        timersRef.current.set(toast.id, timer);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [data, dismiss]);

  return (
    <div className={styles.region} aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div className={styles.toast} key={toast.id} role="status">
          <Link className={styles.content} href={toast.link}>
            <span className={styles.title}>{toast.title}</span>
            <span className={styles.message}>{toast.message}</span>
          </Link>
          <button
            type="button"
            className={styles.dismiss}
            onClick={() => dismiss(toast.id)}
            aria-label={`${toast.title} 알림 닫기`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
