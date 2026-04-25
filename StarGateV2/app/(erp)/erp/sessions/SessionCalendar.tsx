"use client";

import { useCallback, useMemo, useState } from "react";

import type { SessionStatus } from "@/types/session";

import {
  useSessionsByMonth,
  type SerializedSession,
} from "@/hooks/queries/useSessionsQuery";

import Button from "@/components/ui/Button/Button";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Row from "@/components/ui/Row/Row";

import { buildDiscordLink } from "./SessionsClient";

import styles from "./SessionCalendar.module.css";

interface SessionCalendarProps {
  initialSessions: SerializedSession[];
  initialYear: number;
  initialMonth: number;
  guildId: string;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const CHIP_CLASS: Record<SessionStatus, string> = {
  OPEN: "",
  CLOSING: styles["cal__chip--info"],
  CLOSED: styles["cal__chip--success"],
  CANCELING: styles["cal__chip--danger"],
  CANCELED: styles["cal__chip--danger"],
};

/** 내 참여 + CANCELED 아닌 세션에만 attending 시각효과 적용 */
function isAttending(s: SerializedSession): boolean {
  return s.myRsvp === "YES" && s.status !== "CANCELED";
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SessionCalendar({
  initialSessions,
  initialYear,
  initialMonth,
  guildId,
}: SessionCalendarProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);

  const isInitialMonth = year === initialYear && month === initialMonth;

  const {
    data: sessions = [],
    isLoading,
    error: queryError,
  } = useSessionsByMonth(year, month, guildId, {
    initialData: isInitialMonth ? initialSessions : undefined,
  });

  const error = queryError?.message ?? null;

  const handlePrevMonth = useCallback(() => {
    setSelectedDate(null);
    setYear((prevYear) => (month === 1 ? prevYear - 1 : prevYear));
    setMonth((prevMonth) => (prevMonth === 1 ? 12 : prevMonth - 1));
  }, [month]);

  const handleNextMonth = useCallback(() => {
    setSelectedDate(null);
    setYear((prevYear) => (month === 12 ? prevYear + 1 : prevYear));
    setMonth((prevMonth) => (prevMonth === 12 ? 1 : prevMonth + 1));
  }, [month]);

  const handleToday = useCallback(() => {
    const now = new Date();
    setSelectedDate(null);
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  }, []);

  const sessionsByDate = useMemo(() => {
    const map = new Map<number, SerializedSession[]>();
    for (const s of sessions) {
      const d = new Date(s.targetDateTime).getDate();
      const existing = map.get(d);
      if (existing) existing.push(s);
      else map.set(d, [s]);
    }
    return map;
  }, [sessions]);

  const attendingCountByDate = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of sessions) {
      if (!isAttending(s)) continue;
      const d = new Date(s.targetDateTime).getDate();
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return map;
  }, [sessions]);

  const totalDays = daysInMonth(year, month);
  const leadingBlanks = firstDayOfWeek(year, month);
  const totalCells = Math.ceil((leadingBlanks + totalDays) / 7) * 7;
  const today = new Date();

  const selectedSessions =
    selectedDate !== null ? (sessionsByDate.get(selectedDate) ?? []) : [];

  const prevMonthLabel = `${month === 1 ? 12 : month - 1}월`;
  const nextMonthLabel = `${month === 12 ? 1 : month + 1}월`;

  return (
    <div className={styles.cal}>
      <PanelTitle
        right={
          <Row gap={4}>
            <Button
              size="sm"
              onClick={handlePrevMonth}
              disabled={isLoading}
              aria-label="이전 월"
            >
              {`‹ ${prevMonthLabel}`}
            </Button>
            <Button size="sm" onClick={handleToday} disabled={isLoading}>
              오늘
            </Button>
            <Button
              size="sm"
              onClick={handleNextMonth}
              disabled={isLoading}
              aria-label="다음 월"
            >
              {`${nextMonthLabel} ›`}
            </Button>
          </Row>
        }
      >
        {year} · {String(month).padStart(2, "0")}월
      </PanelTitle>

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className={styles.loading}>불러오는 중...</div>
      ) : (
        <>
          <div className={styles.cal__head} role="row">
            {DAY_LABELS.map((label) => (
              <span key={label} role="columnheader">
                {label}
              </span>
            ))}
          </div>

          <div role="grid" aria-label={`${year}년 ${month}월 캘린더`}>
            {Array.from({ length: totalCells / 7 }).map((_, rowIndex) => (
              <div key={rowIndex} className={styles.cal__row} role="row">
                {Array.from({ length: 7 }).map((__, colIndex) => {
                  const idx = rowIndex * 7 + colIndex;
                  const dayNum = idx - leadingBlanks + 1;
                  const valid = dayNum >= 1 && dayNum <= totalDays;

                  if (!valid) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className={`${styles.cal__cell} ${styles["cal__cell--empty"]}`}
                        role="gridcell"
                        aria-hidden="true"
                      />
                    );
                  }

                  const cellDate = new Date(year, month - 1, dayNum);
                  const isToday = isSameDay(cellDate, today);
                  const isSelected = selectedDate === dayNum;
                  const dow = cellDate.getDay();
                  const daySessions = sessionsByDate.get(dayNum) ?? [];
                  const hasSessions = daySessions.length > 0;

                  const classes = [
                    styles.cal__cell,
                    isToday && styles["cal__cell--today"],
                    isSelected && styles["cal__cell--selected"],
                    hasSessions && styles["cal__cell--clickable"],
                    dow === 0 && styles["cal__cell--sunday"],
                    dow === 6 && styles["cal__cell--saturday"],
                  ]
                    .filter(Boolean)
                    .join(" ");

                  const attendCount = attendingCountByDate.get(dayNum) ?? 0;
                  const content = (
                    <>
                      <span className={styles.cal__date}>{dayNum}</span>
                      {attendCount > 0 ? (
                        <span
                          className={styles.cal__attend}
                          aria-label={`내 참여 ${attendCount}건`}
                        >
                          ●{attendCount > 1 ? attendCount : ""}
                        </span>
                      ) : null}
                      {hasSessions ? (
                        <div className={styles.cal__chips}>
                          {daySessions.slice(0, 2).map((s) => {
                            const attending = isAttending(s);
                            const chipClassName = [
                              styles.cal__chip,
                              CHIP_CLASS[s.status] ?? "",
                              attending ? styles["cal__chip--attending"] : "",
                            ]
                              .filter(Boolean)
                              .join(" ");
                            return (
                              <span
                                key={s._id}
                                className={chipClassName}
                                title={`${s.title} · ${s.status} · 참여 ${s.counts.yes}명`}
                              >
                                {attending ? "★ " : ""}
                                {s.title}
                              </span>
                            );
                          })}
                          {daySessions.length > 2 ? (
                            <span className={styles.cal__chip}>
                              +{daySessions.length - 2}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  );

                  if (hasSessions) {
                    return (
                      <button
                        key={dayNum}
                        type="button"
                        className={classes}
                        onClick={() => setSelectedDate(dayNum)}
                        aria-label={`${month}월 ${dayNum}일, 세션 ${daySessions.length}건${
                          attendCount > 0 ? `, 내 참여 ${attendCount}건` : ""
                        }`}
                        aria-pressed={isSelected}
                      >
                        {content}
                      </button>
                    );
                  }

                  return (
                    <div
                      key={dayNum}
                      className={classes}
                      role="gridcell"
                      aria-label={`${month}월 ${dayNum}일`}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className={styles.cal__legend} aria-hidden>
            <span>범례:</span>
            <span className={styles.cal__chip}>모집중</span>
            <span className={`${styles.cal__chip} ${styles["cal__chip--info"]}`}>
              마감 임박
            </span>
            <span
              className={`${styles.cal__chip} ${styles["cal__chip--success"]}`}
            >
              확정
            </span>
            <span
              className={`${styles.cal__chip} ${styles["cal__chip--danger"]}`}
            >
              취소
            </span>
            <span
              className={`${styles.cal__chip} ${styles["cal__chip--attending"]}`}
            >
              ★ 내 참여
            </span>
          </div>
        </>
      )}

      {selectedDate !== null && !isLoading ? (
        <div className={styles.detail}>
          {selectedSessions.length === 0 ? (
            <div className={styles.loading}>해당 날짜에 세션이 없습니다.</div>
          ) : (
            selectedSessions.map((s) => (
              <div key={s._id} className={styles.detail__row}>
                <span className={styles.detail__time}>
                  {formatTime(s.targetDateTime)}
                </span>
                <span className={styles.detail__title}>
                  {isAttending(s) ? (
                    <span
                      className={styles.detail__mark}
                      aria-label="내 참여"
                    >
                      ★{" "}
                    </span>
                  ) : null}
                  {s.title}
                </span>
                <span className={styles.detail__count}>
                  {s.counts.yes}명
                </span>
                <Button
                  as="a"
                  size="sm"
                  href={buildDiscordLink(s)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${s.title} · 디스코드에서 열기`}
                >
                  ↗
                </Button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
