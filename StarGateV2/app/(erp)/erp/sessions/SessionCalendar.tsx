"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";
import type { SessionStatus } from "@/types/session";

import {
  buildDiscordLink,
  formatTime,
  isAttending,
  isSameDay,
  pad,
} from "./_utils";

import styles from "./SessionCalendar.module.css";

interface SessionCalendarProps {
  sessions: SerializedSession[];
  year: number;
  month: number;
}

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

const CHIP_MOD: Record<SessionStatus, "" | "closing" | "closed" | "cancel"> = {
  OPEN: "",
  CLOSING: "closing",
  CLOSED: "closed",
  CANCELING: "cancel",
  CANCELED: "cancel",
};

interface CalendarCell {
  date: Date;
  inMonth: boolean;
}

function buildGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month - 1, 1);
  const startDow = first.getDay();
  const start = new Date(year, month - 1, 1 - startDow);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month - 1 });
  }
  // 마지막 줄이 전부 다음 달이면 잘라낸다 (5주 그리드).
  const lastRowAllOther = cells.slice(35, 42).every((c) => !c.inMonth);
  return lastRowAllOther ? cells.slice(0, 35) : cells;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function SessionCalendar({
  sessions,
  year,
  month,
}: SessionCalendarProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const cells = useMemo(() => buildGrid(year, month), [year, month]);
  const today = new Date();

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SerializedSession[]>();
    for (const s of sessions) {
      const d = new Date(s.targetDateTime);
      const key = dateKey(d);
      const bucket = map.get(key);
      if (bucket) bucket.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.targetDateTime).getTime() -
          new Date(b.targetDateTime).getTime(),
      );
    }
    return map;
  }, [sessions]);

  const selectedSessions = selectedKey
    ? (sessionsByDate.get(selectedKey) ?? [])
    : [];

  return (
    <div className={styles.cal}>
      <div className={styles.head} role="row">
        {DAY_LABELS.map((l, idx) => (
          <span
            key={l}
            role="columnheader"
            className={
              idx === 0 ? styles.sun : idx === 6 ? styles.sat : undefined
            }
          >
            {l}
          </span>
        ))}
      </div>

      <div
        className={styles.grid}
        role="grid"
        aria-label={`${year}년 ${month}월 캘린더`}
      >
        {cells.map((c, i) => {
          const dow = i % 7;
          const key = dateKey(c.date);
          const isToday = isSameDay(c.date, today);
          const events = sessionsByDate.get(key) ?? [];
          const hasAttending = events.some(isAttending);
          const visible = events.slice(0, 3);
          const overflow = events.length - visible.length;
          const isSelected = selectedKey === key;

          const cls = [
            styles.cell,
            !c.inMonth ? styles["cell--other"] : "",
            isToday ? styles["cell--today"] : "",
            events.length > 0 ? styles["cell--clickable"] : "",
            isSelected ? styles["cell--selected"] : "",
          ]
            .filter(Boolean)
            .join(" ");

          const dCls = [
            styles.day,
            dow === 0 ? styles["day--sun"] : "",
            dow === 6 ? styles["day--sat"] : "",
          ]
            .filter(Boolean)
            .join(" ");

          const content = (
            <>
              <div className={dCls}>
                <span>{c.date.getDate()}</span>
                {isToday ? (
                  <span className={styles.todayTag}>TODAY</span>
                ) : hasAttending ? (
                  <span className={styles.attendDot} aria-label="내 참여" />
                ) : null}
              </div>
              {visible.map((e) => {
                const mod = CHIP_MOD[e.status];
                const chipCls = [styles.chip, mod ? styles[`chip--${mod}`] : ""]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <span
                    key={e._id}
                    className={chipCls}
                    title={`${e.title} · ${formatTime(e.targetDateTime)}`}
                  >
                    <span className={styles.t}>
                      {formatTime(e.targetDateTime)}
                    </span>
                    <span className={styles.n}>{e.title}</span>
                    {isAttending(e) && (
                      <span className={styles.chipMe} aria-label="내 참여" />
                    )}
                  </span>
                );
              })}
              {overflow > 0 && (
                <span className={styles.more}>+{overflow} more</span>
              )}
            </>
          );

          if (events.length > 0) {
            return (
              <button
                key={key}
                type="button"
                className={cls}
                onClick={() =>
                  setSelectedKey((prev) => (prev === key ? null : key))
                }
                aria-pressed={isSelected}
                aria-label={`${c.date.getMonth() + 1}월 ${c.date.getDate()}일 · 세션 ${events.length}건`}
              >
                {content}
              </button>
            );
          }
          return (
            <div key={key} className={cls} role="gridcell">
              {content}
            </div>
          );
        })}
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.sw} />
          모집중 OPEN
        </div>
        <div
          className={`${styles.legendItem} ${styles["legendItem--closing"]}`}
        >
          <span className={styles.sw} />
          마감 임박
        </div>
        <div className={`${styles.legendItem} ${styles["legendItem--closed"]}`}>
          <span className={styles.sw} />
          확정 CLOSED
        </div>
        <div className={`${styles.legendItem} ${styles["legendItem--cancel"]}`}>
          <span className={styles.sw} />
          취소
        </div>
        <div className={`${styles.legendItem} ${styles["legendItem--mine"]}`}>
          <span className={styles.sw} />내 참여
        </div>
      </div>

      {selectedKey && selectedSessions.length > 0 ? (
        <div className={styles.detail}>
          {selectedSessions.map((s) => (
            <Link
              key={s._id}
              href={buildDiscordLink(s)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.detail__row}
            >
              <span className={styles.detail__time}>
                {formatTime(s.targetDateTime)}
              </span>
              <span className={styles.detail__title}>
                {isAttending(s) && (
                  <span className={styles.chipMe} aria-label="내 참여" />
                )}
                {s.title}
              </span>
              <span className={styles.detail__count}>{s.counts.yes}명 응답</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
