"use client";

import {
  useMarkRead,
  useMarkAllRead,
} from "@/hooks/mutations/useNotificationMutation";

import Button from "@/components/ui/Button/Button";

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

  function handleMarkSingleRead() {
    if (!notificationId) return;
    markRead.mutate(notificationId, {
      onError: (err) => alert(err.message),
    });
  }

  function handleMarkAllRead() {
    markAllRead.mutate(undefined, {
      onError: (err) => alert(err.message),
    });
  }

  if (mode === "single") {
    return (
      <Button
        type="button"
        size="sm"
        onClick={handleMarkSingleRead}
        disabled={loading}
      >
        {loading ? "처리 중..." : "읽음"}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      onClick={handleMarkAllRead}
      disabled={loading}
    >
      {loading ? "처리 중..." : "모두 읽음 처리"}
    </Button>
  );
}
