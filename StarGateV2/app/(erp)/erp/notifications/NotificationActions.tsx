"use client";

import {
  useMarkRead,
  useMarkAllRead,
} from "@/hooks/mutations/useNotificationMutation";

import styles from "./page.module.css";

interface Props {
  notificationId?: string;
  mode?: "single" | "all";
}

export default function NotificationActions({
  notificationId,
  mode = "all",
}: Props) {
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const loading = markRead.isPending || markAllRead.isPending;

  const handleMarkSingleRead = () => {
    if (!notificationId) return;
    markRead.mutate(notificationId, {
      onError: (err) => alert(err.message),
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onError: (err) => alert(err.message),
    });
  };

  if (mode === "single") {
    return (
      <button
        type="button"
        className={styles.notif__readBtn}
        onClick={handleMarkSingleRead}
        disabled={loading}
      >
        {loading ? "처리 중..." : "읽음"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={styles.notif__readAllBtn}
      onClick={handleMarkAllRead}
      disabled={loading}
    >
      {loading ? "처리 중..." : "모두 읽음 처리"}
    </button>
  );
}
