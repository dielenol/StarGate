"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

interface Props {
  notificationId?: string;
  mode?: "single" | "all";
}

export default function NotificationActions({
  notificationId,
  mode = "all",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleMarkAllRead = async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/erp/notifications/read-all", {
        method: "POST",
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error ?? "처리에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSingleRead = async () => {
    if (!notificationId) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/erp/notifications/${notificationId}`, {
        method: "PATCH",
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error ?? "처리에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
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
