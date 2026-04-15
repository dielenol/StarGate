"use client";

import { useState, useCallback } from "react";

import {
  useSessionsByMonth,
  type SerializedSession,
} from "@/hooks/queries/useSessionsQuery";

import styles from "./SessionCalendar.module.css";

interface SessionCalendarProps {
  initialSessions: SerializedSession[];
  initialYear: number;
  initialMonth: number;
  guildId: string;
}

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
    isLoading: loading,
    error: queryError,
  } = useSessionsByMonth(year, month, guildId, {
    initialData: isInitialMonth ? initialSessions : undefined,
  });

  const error = queryError?.message ?? null;

  const handlePrevMonth = useCallback(() => {
    setSelectedDate(null);
    const newMonth = month === 1 ? 12 : month - 1;
    const newYear = month === 1 ? year - 1 : year;
    setYear(newYear);
    setMonth(newMonth);
  }, [year, month]);

  const handleNextMonth = useCallback(() => {
    setSelectedDate(null);
    const newMonth = month === 12 ? 1 : month + 1;
    const newYear = month === 12 ? year + 1 : year;
    setYear(newYear);
    setMonth(newMonth);
  }, [year, month]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const today = new Date();

  const sessionsByDate = new Map<number, SerializedSession[]>();
  for (const s of sessions) {
    const d = new Date(s.targetDateTime);
    const day = d.getDate();
    const existing = sessionsByDate.get(day);
    if (existing) {
      existing.push(s);
    } else {
      sessionsByDate.set(day, [s]);
    }
  }

  const totalCells = firstDay + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  const cellCount = rows * 7;

  const selectedSessions =
    selectedDate !== null ? sessionsByDate.get(selectedDate) ?? [] : [];

  return (
    <div>
      {/* Navigation */}
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.nav__btn}
          onClick={handlePrevMonth}
          disabled={loading}
          aria-label="이전 월"
        >
          ← 이전
        </button>
        <span className={styles.nav__title}>
          {year}년 {month}월
        </span>
        <button
          type="button"
          className={styles.nav__btn}
          onClick={handleNextMonth}
          disabled={loading}
          aria-label="다음 월"
        >
          다음 →
        </button>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {loading && <div className={styles.loading}>불러오는 중...</div>}

      {/* Calendar grid */}
      {!loading && (
        <div className={styles.calendar} role="grid" aria-label={`${year}년 ${month}월 캘린더`}>
          {/* Day headers */}
          {DAY_LABELS.map((label) => (
            <div key={label} className={styles.calendar__dayHeader} role="columnheader">
              {label}
            </div>
          ))}

          {/* Date cells */}
          {Array.from({ length: cellCount }, (_, i) => {
            const dayNum = i - firstDay + 1;
            const isValid = dayNum >= 1 && dayNum <= daysInMonth;

            if (!isValid) {
              return (
                <div
                  key={`empty-${i}`}
                  className={`${styles.calendar__cell} ${styles["calendar__cell--empty"]}`}
                  role="gridcell"
                  aria-hidden="true"
                />
              );
            }

            const cellDate = new Date(year, month - 1, dayNum);
            const isToday = isSameDay(cellDate, today);
            const isSelected = selectedDate === dayNum;
            const dayOfWeek = cellDate.getDay();
            const daySessions = sessionsByDate.get(dayNum) ?? [];
            const hasSessions = daySessions.length > 0;

            const cellClasses = [
              styles.calendar__cell,
              isToday && styles["calendar__cell--today"],
              isSelected && styles["calendar__cell--selected"],
              hasSessions && styles["calendar__cell--hasSessions"],
              dayOfWeek === 0 && styles["calendar__cell--sunday"],
              dayOfWeek === 6 && styles["calendar__cell--saturday"],
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={dayNum}
                className={cellClasses}
                role="gridcell"
                aria-label={`${month}월 ${dayNum}일${hasSessions ? `, 세션 ${daySessions.length}건` : ""}`}
                tabIndex={hasSessions ? 0 : -1}
                onClick={() => hasSessions && setSelectedDate(dayNum)}
                onKeyDown={(e) => {
                  if (hasSessions && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setSelectedDate(dayNum);
                  }
                }}
              >
                <span className={styles.calendar__date}>{dayNum}</span>
                {hasSessions && (
                  <div className={styles.calendar__dots}>
                    {daySessions.map((s) => (
                      <span
                        key={s._id}
                        className={`${styles.calendar__dot} ${styles[`calendar__dot--${s.status}`]}`}
                        title={`${s.title} (${s.status})`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Selected date detail */}
      {selectedDate !== null && !loading && (
        <div className={styles.detail}>
          <div className={styles.detail__header}>
            <span className={styles.detail__title}>
              {month}월 {selectedDate}일 세션
            </span>
            <button
              type="button"
              className={styles.detail__close}
              onClick={() => setSelectedDate(null)}
            >
              닫기
            </button>
          </div>

          {selectedSessions.length === 0 ? (
            <p className={styles.detail__empty}>해당 날짜에 세션이 없습니다.</p>
          ) : (
            <div className={styles.detail__list}>
              {selectedSessions.map((s) => {
                const dt = new Date(s.targetDateTime);
                return (
                  <div key={s._id} className={styles.detail__card}>
                    <span className={styles.detail__sessionTitle}>{s.title}</span>
                    <span className={styles.detail__sessionTime}>
                      {dt.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={`${styles.detail__sessionStatus} ${styles[`detail__sessionStatus--${s.status}`]}`}
                    >
                      {s.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
