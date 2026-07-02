"use client";

import { useMemo, useState } from "react";

import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";
import type { SessionStatus } from "@/types/session";

import {
  formatTime,
  isAttending,
  isSameDay,
  pad,
  STATUS_LABEL,
} from "./_utils";

import styles from "./SessionCalendar.module.css";

interface SessionCalendarProps {
  sessions: SerializedSession[];
  year: number;
  month: number;
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

function formatDayPanelLabel(key: string): string {
  const [, month, day] = key.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

export default function SessionCalendar({
  sessions,
  year,
  month,
  onDayClick,
  onPrevMonth,
  onNextMonth,
}: SessionCalendarProps) {
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
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
  const selectedEvents = selectedDateKey
    ? sessionsByDate.get(selectedDateKey) ?? []
    : [];
  const selectedDayLabel = selectedDateKey
    ? formatDayPanelLabel(selectedDateKey)
    : "";

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
          const hasAttending = events.some(isAttending);
          const visible = events.slice(0, 3);
          const overflow = events.length - visible.length;

          const cls = [
            styles.cell,
            !c.inMonth ? styles["cell--other"] : "",
            isToday ? styles["cell--today"] : "",
            events.length > 0 ? styles["cell--clickable"] : "",
            selectedDateKey === key && events.length > 0
              ? styles["cell--selected"]
              : "",
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
                const isTrpg = e.source === "trpg";
                const chipCls = [
                  styles.chip,
                  mod ? styles[`chip--${mod}`] : "",
                  isTrpg ? styles["chip--trpg"] : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const titleText = `${isTrpg ? "[TRPG] " : ""}${e.title} · ${formatTime(e.targetDateTime)}`;
                return (
                  <span
                    key={e._id}
                    className={chipCls}
                    title={titleText}
                  >
                    {isTrpg ? (
                      <span
                        className={styles.sourceDot}
                        aria-label="TRPG 봇 세션"
                      />
                    ) : null}
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
                onClick={() => setSelectedDateKey(key)}
                aria-label={`${c.date.getMonth() + 1}월 ${c.date.getDate()}일 · 세션 ${events.length}건 — 날짜 상세 열기`}
                aria-pressed={selectedDateKey === key}
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

      {selectedEvents.length > 0 ? (
        <section
          className={styles.dayPanel}
          aria-label={`${selectedDayLabel} 세션 목록`}
          aria-live="polite"
        >
          <div className={styles.dayPanel__head}>
            <div>
              <span>DAY DETAIL</span>
              <strong>
                {selectedDayLabel} · {selectedEvents.length}건
              </strong>
            </div>
            <button
              type="button"
              className={styles.dayPanel__close}
              onClick={() => setSelectedDateKey(null)}
              aria-label="날짜 상세 닫기"
            >
              닫기
            </button>
          </div>
          <div className={styles.dayPanel__list}>
            {selectedEvents.map((event) => {
              const mod = CHIP_MOD[event.status];
              const itemCls = [
                styles.dayPanel__item,
                mod ? styles[`dayPanel__item--${mod}`] : "",
                event.source === "trpg" ? styles["dayPanel__item--trpg"] : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={event._id}
                  type="button"
                  className={itemCls}
                  onClick={() => onDayClick(event._id)}
                >
                  <span className={styles.dayPanel__time}>
                    {formatTime(event.targetDateTime)}
                  </span>
                  <span className={styles.dayPanel__title}>
                    {event.source === "trpg" ? "[TRPG] " : ""}
                    {event.title}
                  </span>
                  <span className={styles.dayPanel__status}>
                    {STATUS_LABEL[event.status]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

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
