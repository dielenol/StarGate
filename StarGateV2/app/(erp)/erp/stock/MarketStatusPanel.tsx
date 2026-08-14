"use client";

import type { ReactNode } from "react";

import styles from "./page.module.css";

export interface MarketStatusView {
  status: "OPEN" | "CLOSED" | "OPENING_PENDING";
  reason: string;
  asOf: string;
  opensAt: string | null;
  closesAt: string | null;
  nextPriceSlotAt: string | null;
  delayed: boolean;
  pendingSlotKeys: string[];
  earlyCloseAt: string | null;
}

interface Props {
  market?: MarketStatusView;
  compact?: boolean;
}

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTime(value: string | null): string {
  if (!value) return "운영 대기";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : KST_FORMATTER.format(date);
}

function statusLabel(status: MarketStatusView["status"]): string {
  if (status === "OPEN") return "개장";
  if (status === "OPENING_PENDING") return "개장 준비";
  return "폐장";
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.marketStatus__detail}>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export default function MarketStatusPanel({ market, compact = false }: Props) {
  if (!market) {
    return (
      <section className={styles.marketStatus} aria-label="NOVEX 시장 상태">
        <div className={styles.marketStatus__head}>
          <span>NOVEX MARKET</span>
          <strong>상태 동기화 중</strong>
        </div>
        <p className={styles.marketStatus__empty}>시장 운영 상태를 불러오는 중입니다.</p>
      </section>
    );
  }

  const tone =
    market.status === "OPEN"
      ? "open"
      : market.status === "OPENING_PENDING"
        ? "pending"
        : "closed";

  return (
    <section
      className={[styles.marketStatus, styles[`marketStatus--${tone}`]].join(" ")}
      aria-label="NOVEX 시장 상태"
    >
      <div className={styles.marketStatus__head}>
        <span>NOVEX MARKET</span>
        <strong>{statusLabel(market.status)}</strong>
      </div>
      <p className={styles.marketStatus__reason}>{market.reason}</p>
      {!compact ? (
        <div className={styles.marketStatus__grid}>
          <Detail label="다음 가격 회차">{formatTime(market.nextPriceSlotAt)}</Detail>
          <Detail label={market.status === "CLOSED" ? "다음 개장" : "폐장 예정"}>
            {formatTime(market.status === "CLOSED" ? market.opensAt : market.closesAt)}
          </Detail>
          {market.earlyCloseAt ? (
            <Detail label="조기 폐장">{formatTime(market.earlyCloseAt)}</Detail>
          ) : null}
        </div>
      ) : null}
      {market.delayed ? (
        <div className={styles.marketStatus__delay} role="status">
          가격 회차 지연 · {market.pendingSlotKeys.length}건 복구 대기
        </div>
      ) : null}
    </section>
  );
}
