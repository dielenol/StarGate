"use client";

import { useMemo } from "react";

import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";
import type { SessionStatus } from "@/types/session";

import {
  formatTime,
  inGroup,
  isAttending,
  isSameDay,
  pad,
  type StatusGroup,
} from "./_utils";

import styles from "./SessionCalendar.module.css";

interface SessionCalendarProps {
  sessions: SerializedSession[];
  year: number;
  month: number;
  /** STATUS pill 강조용 — 매칭되지 않는 chip 은 dim 처리. ALL 이면 강조 없음. */
  highlightGroup?: StatusGroup;
  /** 일자 셀 클릭 시 호출 — 그 일자의 첫 세션 id 를 전달한다. 리스트 뷰로 점프하는 용도. */
  onDayClick: (sessionId: string) => void;
  /** 캘린더 좌측 floating 화살표 — 이전 월로 이동. */
  onPrevMonth: () => void;
  /** 캘린더 우측 floating 화살표 — 다음 월로 이동. */
  onNextMonth: () => void;
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
  highlightGroup = "ALL",
  onDayClick,
  onPrevMonth,
  onNextMonth,
}: SessionCalendarProps) {
  const cells = useMemo(() => buildGrid(year, month), [year, month]);
  const today = new Date();
  const isHighlighting = highlightGroup !== "ALL";

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

  return (
    <div className={styles.cal}>
      <button
        type="button"
        className={`${styles.navBtn} ${styles["navBtn--prev"]}`}
        onClick={onPrevMonth}
        aria-label="이전 월"
      >
        ‹
      </button>
      <button
        type="button"
        className={`${styles.navBtn} ${styles["navBtn--next"]}`}
        onClick={onNextMonth}
        aria-label="다음 월"
      >
        ›
      </button>
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
          const matchedEvents = isHighlighting
            ? events.filter((e) => inGroup(e, highlightGroup))
            : events;
          const hasAttending = matchedEvents.some(isAttending);
          const visible = events.slice(0, 3);
          const overflow = events.length - visible.length;
          const cellDim =
            isHighlighting && events.length > 0 && matchedEvents.length === 0;

          const cls = [
            styles.cell,
            !c.inMonth ? styles["cell--other"] : "",
            isToday ? styles["cell--today"] : "",
            events.length > 0 ? styles["cell--clickable"] : "",
            cellDim ? styles["cell--dim"] : "",
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
                const dim = isHighlighting && !inGroup(e, highlightGroup);
                const chipCls = [
                  styles.chip,
                  mod ? styles[`chip--${mod}`] : "",
                  dim ? styles["chip--dim"] : "",
                ]
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
            const firstId = events[0]._id;
            return (
              <button
                key={key}
                type="button"
                className={cls}
                onClick={() => onDayClick(firstId)}
                aria-label={`${c.date.getMonth() + 1}월 ${c.date.getDate()}일 · 세션 ${events.length}건 — 리스트로 이동`}
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

    </div>
  );
}
