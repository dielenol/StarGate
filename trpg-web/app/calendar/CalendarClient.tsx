"use client";

import { useMemo, useState } from "react";

import { signOut } from "next-auth/react";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import {
  buildCalendarGrid,
  currentKstDateString,
  currentKstYearMonth,
  shiftMonth,
  type CalendarCell,
} from "@/lib/calendar/month";
import type { TrpgSessionView } from "@/lib/trpg/serializer";

import { useTrpgMembers } from "@/hooks/queries/useTrpgMembers";
import { useTrpgSessions } from "@/hooks/queries/useTrpgSessions";

import { SessionCreateModal } from "./SessionCreateModal";
import { SessionDetailModal } from "./SessionDetailModal";

import styles from "./styles.module.css";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const MAX_VISIBLE_SESSIONS_PER_CELL = 3;

interface Props {
  currentUserDiscordId: string;
  initialYear: number;
  initialMonth: number;
  initialSessions: TrpgSessionView[];
  initialMembers: TrpgMemberView[];
}

export function CalendarClient({
  currentUserDiscordId,
  initialYear,
  initialMonth,
  initialSessions,
  initialMembers,
}: Props) {
  const [{ year, month }, setYearMonth] = useState(() => ({
    year: initialYear,
    month: initialMonth,
  }));
  const [createModalDate, setCreateModalDate] = useState<string | null>(null);
  const [detailModalSession, setDetailModalSession] =
    useState<TrpgSessionView | null>(null);

  // "오늘"은 컴포넌트 라이프타임 동안 고정 — 매 렌더 재계산하지 않는다.
  const todayKey = useMemo(() => currentKstDateString(), []);

  // 초기 prefetch 결과는 초기 연·월에서만 유효.
  const isInitialMonth = year === initialYear && month === initialMonth;

  const sessionsQuery = useTrpgSessions(year, month, {
    initialData: isInitialMonth ? initialSessions : undefined,
  });
  const membersQuery = useTrpgMembers({ initialData: initialMembers });

  const sessions = useMemo(
    () => sessionsQuery.data ?? [],
    [sessionsQuery.data],
  );
  const members = useMemo(
    () => membersQuery.data ?? [],
    [membersQuery.data],
  );

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, TrpgSessionView[]>();
    for (const s of sessions) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    // 시작 시간 오름차순 정렬.
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [sessions]);

  const grid: CalendarCell[] = useMemo(
    () => buildCalendarGrid(year, month),
    [year, month],
  );

  function handlePrev() {
    setYearMonth((prev) => shiftMonth(prev, -1));
  }
  function handleNext() {
    setYearMonth((prev) => shiftMonth(prev, 1));
  }
  function handleToday() {
    setYearMonth(currentKstYearMonth());
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <main className={styles.calendar}>
      <header className={styles.calendar__header}>
        <div className={styles["calendar__title-wrap"]}>
          <h1 className={styles.calendar__title}>
            {year}년 {String(month).padStart(2, "0")}월
          </h1>
          <button
            className={styles.calendar__today}
            type="button"
            onClick={handleToday}
          >
            오늘로
          </button>
        </div>

        <div className={styles.calendar__controls}>
          <button
            className={styles.calendar__nav}
            type="button"
            onClick={handlePrev}
            aria-label="이전 달"
          >
            ‹
          </button>
          <button
            className={styles.calendar__nav}
            type="button"
            onClick={handleNext}
            aria-label="다음 달"
          >
            ›
          </button>
          <button
            className={styles["calendar__sign-out"]}
            type="button"
            onClick={handleSignOut}
          >
            로그아웃
          </button>
        </div>
      </header>

      {sessionsQuery.isError ? (
        <p className={styles.calendar__error} role="alert">
          {sessionsQuery.error instanceof Error
            ? sessionsQuery.error.message
            : "세션 조회 실패"}
        </p>
      ) : null}

      <div className={styles.calendar__weekdays}>
        {WEEKDAY_LABELS.map((label, idx) => (
          <div
            key={label}
            className={`${styles.calendar__weekday} ${
              idx === 0 ? styles["calendar__weekday--sun"] : ""
            } ${idx === 6 ? styles["calendar__weekday--sat"] : ""}`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className={styles.calendar__grid}>
        {grid.map((cell) => {
          const daySessions = sessionsByDate.get(cell.dateKey) ?? [];
          const visible = daySessions.slice(0, MAX_VISIBLE_SESSIONS_PER_CELL);
          const overflow = daySessions.length - visible.length;
          const isToday = cell.dateKey === todayKey;

          return (
            // 셀 자체는 비-인터랙티브 컨테이너. 내부 요소(+ 추가 버튼, chip 버튼,
            // 빈 영역 fill 버튼)만 명시적으로 클릭 가능 — nested interactive 해소.
            <div
              key={cell.dateKey}
              className={`${styles.calendar__cell} ${
                cell.inMonth ? "" : styles["calendar__cell--out"]
              } ${isToday ? styles["calendar__cell--today"] : ""}`}
            >
              <div className={styles["calendar__cell-head"]}>
                <span className={styles["calendar__cell-day"]}>{cell.day}</span>
                <button
                  type="button"
                  className={styles["calendar__cell-add"]}
                  aria-label={`${cell.dateKey} 에 세션 추가`}
                  onClick={() => setCreateModalDate(cell.dateKey)}
                >
                  +
                </button>
              </div>

              <ul className={styles["calendar__cell-sessions"]}>
                {visible.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={styles.calendar__chip}
                      onClick={() => setDetailModalSession(s)}
                      aria-label={`${s.startTime} ${s.title} 세션 상세`}
                    >
                      <span className={styles["calendar__chip-time"]}>
                        {s.startTime}
                      </span>
                      <span className={styles["calendar__chip-title"]}>
                        {s.title}
                      </span>
                    </button>
                  </li>
                ))}
                {overflow > 0 ? (
                  <li className={styles["calendar__chip-more"]}>
                    +{overflow}건 더보기
                  </li>
                ) : null}
              </ul>

              {/* 셀의 빈 여백을 클릭해도 세션 추가 모달이 열리도록 fill 버튼을
                  깔아 둔다. chip / + 버튼은 above z-index 로 가린다. */}
              <button
                type="button"
                className={styles["calendar__cell-fill"]}
                aria-label={`${cell.dateKey} 에 세션 추가`}
                tabIndex={-1}
                onClick={() => setCreateModalDate(cell.dateKey)}
              />
            </div>
          );
        })}
      </div>

      {createModalDate ? (
        <SessionCreateModal
          defaultDate={createModalDate}
          members={members}
          existingSessions={sessions}
          currentUserDiscordId={currentUserDiscordId}
          onClose={() => setCreateModalDate(null)}
        />
      ) : null}

      {detailModalSession ? (
        <SessionDetailModal
          session={detailModalSession}
          members={members}
          existingSessions={sessions}
          currentUserDiscordId={currentUserDiscordId}
          onClose={() => setDetailModalSession(null)}
        />
      ) : null}
    </main>
  );
}
