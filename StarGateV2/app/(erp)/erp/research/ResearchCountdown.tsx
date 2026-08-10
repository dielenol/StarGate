"use client";

import { useEffect, useRef, useState } from "react";

export type ResearchTimestamp = string | number | Date;

interface ResearchCountdownProps {
  completesAt: ResearchTimestamp;
  serverNow: ResearchTimestamp;
  onExpire?: () => void;
  onRefresh?: () => void;
  className?: string;
}

function toMilliseconds(value: ResearchTimestamp): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

/** 서버 기준 시각과 브라우저 시계의 차이를 한 번만 보정하는 leaf ticker. */
export default function ResearchCountdown({
  completesAt,
  serverNow,
  onExpire,
  onRefresh,
  className,
}: ResearchCountdownProps) {
  const completesAtMs = toMilliseconds(completesAt);
  const serverNowMs = toMilliseconds(serverNow);
  const offsetRef = useRef(0);
  const notifiedExpiryRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => serverNowMs);

  useEffect(() => {
    offsetRef.current = serverNowMs - Date.now();
    setNow(Date.now() + offsetRef.current);
  }, [serverNowMs]);

  useEffect(() => {
    const tick = () => setNow(Date.now() + offsetRef.current);
    const timer = window.setInterval(tick, 1_000);
    const handleFocus = () => {
      tick();
      onRefresh?.();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [onRefresh]);

  const remaining = Math.max(0, completesAtMs - now);
  useEffect(() => {
    if (
      remaining === 0 &&
      notifiedExpiryRef.current !== completesAtMs
    ) {
      notifiedExpiryRef.current = completesAtMs;
      onExpire?.();
    }
  }, [completesAtMs, onExpire, remaining]);

  return (
    <time className={className} dateTime={new Date(completesAtMs).toISOString()}>
      {remaining === 0 ? "완료 처리 대기" : formatRemaining(remaining)}
    </time>
  );
}
