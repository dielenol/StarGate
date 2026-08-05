"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import {
  useGoogleCalendarConnection,
  useGoogleCalendarEvents,
} from "@/hooks/queries/useGoogleCalendar";
import { useTrpgMembers } from "@/hooks/queries/useTrpgMembers";
import { useTrpgSessions } from "@/hooks/queries/useTrpgSessions";
import { yearMonthFromDateKey } from "@/lib/calendar/date-key";
import {
  getKoreanHolidayInfo,
  getKstWeekday,
} from "@/lib/calendar/korean-holidays";
import {
  buildCalendarGrid,
  currentKstDateString,
  currentKstYearMonth,
  shiftMonth,
  type CalendarCell,
} from "@/lib/calendar/month";
import { GoogleCalendarClientError } from "@/lib/google-calendar/client";
import type {
  GoogleCalendarConnectionView,
  GoogleCalendarEventView,
} from "@/lib/google-calendar/types";
import type { TrpgSessionView } from "@/lib/trpg/serializer";

import { GoogleCalendarSettingsModal } from "./GoogleCalendarSettingsModal";
import { SessionCreateModal } from "./SessionCreateModal";
import { SessionDetailModal } from "./SessionDetailModal";

import styles from "./styles.module.css";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEKDAY_ICON_ITEMS = [
  { label: "Sun", ariaLabel: "일요일", toneClass: "calendar__weekday--sun" },
  { label: "Mon", ariaLabel: "월요일", toneClass: "calendar__weekday--mon" },
  { label: "Tue", ariaLabel: "화요일", toneClass: "calendar__weekday--tue" },
  { label: "Wed", ariaLabel: "수요일", toneClass: "calendar__weekday--wed" },
  { label: "Thu", ariaLabel: "목요일", toneClass: "calendar__weekday--thu" },
  { label: "Fri", ariaLabel: "금요일", toneClass: "calendar__weekday--fri" },
  { label: "Sat", ariaLabel: "토요일", toneClass: "calendar__weekday--sat" },
] as const;
const MAX_VISIBLE_SESSIONS_PER_CELL = 2;

interface Props {
  currentUserDiscordId: string;
  initialYear: number;
  initialMonth: number;
  initialSessions: TrpgSessionView[];
  initialMembers: TrpgMemberView[];
  initialGoogleConnection: GoogleCalendarConnectionView;
  initialGoogleStatus?: string | null;
  initialSelectedDate?: string | null;
  initialFocusedSessionId?: string | null;
}

function isUserSession(
  session: TrpgSessionView,
  currentUserDiscordId: string,
): boolean {
  return (
    session.createdByDiscordId === currentUserDiscordId ||
    session.participantDiscordIds.includes(currentUserDiscordId)
  );
}

export function CalendarClient({
  currentUserDiscordId,
  initialYear,
  initialMonth,
  initialSessions,
  initialMembers,
  initialGoogleConnection,
  initialGoogleStatus = null,
  initialSelectedDate = null,
  initialFocusedSessionId = null,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [{ year, month }, setYearMonth] = useState(() => ({
    year: initialYear,
    month: initialMonth,
  }));
  const [createModalDate, setCreateModalDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialSelectedDate,
  );
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(
    initialFocusedSessionId,
  );
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [googleSettingsOpen, setGoogleSettingsOpen] = useState(
    initialGoogleStatus === "connected",
  );
  const [googleCallbackStatus] = useState(initialGoogleStatus);
  const [detailModalSession, setDetailModalSession] =
    useState<TrpgSessionView | null>(
      () =>
        initialSessions.find((session) => session.id === initialFocusedSessionId) ??
        null,
    );

  // "오늘"은 컴포넌트 라이프타임 동안 고정 — 매 렌더 재계산하지 않는다.
  const todayKey = useMemo(() => currentKstDateString(), []);

  // 초기 prefetch 결과는 초기 연·월에서만 유효.
  const isInitialMonth = year === initialYear && month === initialMonth;

  const sessionsQuery = useTrpgSessions(year, month, {
    initialData: isInitialMonth ? initialSessions : undefined,
  });
  const membersQuery = useTrpgMembers({ initialData: initialMembers });
  const googleConnectionQuery = useGoogleCalendarConnection(
    initialGoogleConnection,
  );
  const googleConnection =
    googleConnectionQuery.data ?? initialGoogleConnection;
  const googleConnectionUnavailable =
    !googleConnection.available || googleConnectionQuery.isError;
  const googleEventsEnabled =
    googleConnection.enabled &&
    !googleConnectionUnavailable &&
    googleConnection.connected &&
    !googleConnection.reconnectRequired &&
    googleConnection.selectedCalendarCount > 0;
  const googleEventsQuery = useGoogleCalendarEvents(
    year,
    month,
    googleEventsEnabled,
  );
  const googleQueryNeedsReconnect =
    googleEventsQuery.error instanceof GoogleCalendarClientError &&
    googleEventsQuery.error.code === "GOOGLE_RECONNECT_REQUIRED";
  const effectiveGoogleConnection = googleConnectionUnavailable
    ? { ...googleConnection, available: false }
    : googleQueryNeedsReconnect
      ? { ...googleConnection, reconnectRequired: true }
      : googleConnection;

  useEffect(() => {
    if (!googleCallbackStatus) return;
    if (googleCallbackStatus === "connected") {
      showToast("Google Calendar가 연결되었습니다.");
    }
    router.replace("/calendar", { scroll: false });
  }, [googleCallbackStatus, router, showToast]);

  const sessions = useMemo(
    () => sessionsQuery.data ?? [],
    [sessionsQuery.data],
  );
  const displaySessions = useMemo(
    () =>
      showMineOnly
        ? sessions.filter((session) =>
            isUserSession(session, currentUserDiscordId),
          )
        : sessions,
    [currentUserDiscordId, sessions, showMineOnly],
  );
  const members = useMemo(
    () => membersQuery.data ?? [],
    [membersQuery.data],
  );
  const currentMember = useMemo(
    () =>
      members.find((member) => member.discordUserId === currentUserDiscordId),
    [currentUserDiscordId, members],
  );

  const googleEventsByDate = useMemo(() => {
    const map = new Map<string, GoogleCalendarEventView[]>();
    for (const event of googleEventsQuery.data?.events ?? []) {
      const items = map.get(event.date) ?? [];
      items.push(event);
      map.set(event.date, items);
    }
    return map;
  }, [googleEventsQuery.data?.events]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, TrpgSessionView[]>();
    for (const s of displaySessions) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    // 시작 시간 오름차순 정렬.
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [displaySessions]);

  const grid: CalendarCell[] = useMemo(
    () => buildCalendarGrid(year, month),
    [year, month],
  );
  const selectedDateSessions = useMemo(() => {
    if (!selectedDate) return [];
    return sessionsByDate.get(selectedDate) ?? [];
  }, [sessionsByDate, selectedDate]);
  const selectedDateGoogleEvents = useMemo(() => {
    if (!selectedDate) return [];
    return googleEventsByDate.get(selectedDate) ?? [];
  }, [googleEventsByDate, selectedDate]);
  const selectedDateCanCreate = selectedDate ? selectedDate >= todayKey : true;

  function handlePrev() {
    setSelectedDate(null);
    setFocusedSessionId(null);
    setYearMonth((prev) => shiftMonth(prev, -1));
  }
  function handleNext() {
    setSelectedDate(null);
    setFocusedSessionId(null);
    setYearMonth((prev) => shiftMonth(prev, 1));
  }
  function handleToday() {
    setSelectedDate(null);
    setFocusedSessionId(null);
    setYearMonth(currentKstYearMonth());
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: "/login" });
  }

  function handleOpenCreate(dateKey = todayKey) {
    if (dateKey < todayKey) return;
    setCreateModalDate(dateKey);
  }

  function handleSelectDate(dateKey: string, sessionId?: string) {
    const targetYearMonth = yearMonthFromDateKey(dateKey);
    if (!targetYearMonth) return;
    if (targetYearMonth.year !== year || targetYearMonth.month !== month) {
      setYearMonth(targetYearMonth);
    }
    setSelectedDate(dateKey);
    setFocusedSessionId(sessionId ?? null);
  }

  function handleOpenSessionDetail(session: TrpgSessionView) {
    setSelectedDate(session.date);
    setFocusedSessionId(session.id);
    setDetailModalSession(session);
  }

  const handleCloseGoogleSettings = useCallback(() => {
    setGoogleSettingsOpen(false);
  }, []);

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
          <button
            className={`${styles["calendar__mine-toggle"]} ${
              showMineOnly ? styles["calendar__mine-toggle--active"] : ""
            }`}
            type="button"
            aria-pressed={showMineOnly}
            onClick={() => setShowMineOnly((prev) => !prev)}
          >
            {showMineOnly ? "전체 세션 보기" : "내 세션만 보기"}
          </button>
          {googleConnection.enabled ? (
            <button
              className={`${styles["calendar__google-toggle"]} ${
                effectiveGoogleConnection.connected
                  ? styles["calendar__google-toggle--connected"]
                  : ""
              } ${
                !effectiveGoogleConnection.available ||
                effectiveGoogleConnection.reconnectRequired
                  ? styles["calendar__google-toggle--warning"]
                  : ""
              }`}
              type="button"
              onClick={() => setGoogleSettingsOpen(true)}
              aria-label={
                effectiveGoogleConnection.available
                  ? "Google Calendar 연결 및 표시 설정"
                  : "Google Calendar 연결 상태 확인 실패. 설정 열기"
              }
            >
              <span aria-hidden="true">G</span>
              <span>Google 일정</span>
              {effectiveGoogleConnection.connected ? (
                <strong>
                  {!effectiveGoogleConnection.available ||
                  effectiveGoogleConnection.reconnectRequired
                    ? "!"
                    : effectiveGoogleConnection.selectedCalendarCount}
                </strong>
              ) : null}
            </button>
          ) : null}
          <button
            className={styles["calendar__create-btn"]}
            type="button"
            onClick={() => handleOpenCreate()}
          >
            + 일정 생성
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
          <span className={styles.calendar__profile} title="현재 로그인 사용자">
            {currentMember?.displayName ?? currentUserDiscordId}
          </span>
          <ThemeToggle />
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

      {googleCallbackStatus && googleCallbackStatus !== "connected" ? (
        <p className={styles.calendar__error} role="alert">
          {getGoogleCallbackMessage(googleCallbackStatus)}
        </p>
      ) : null}

      {googleConnection.enabled && !effectiveGoogleConnection.available ? (
        <div className={styles["calendar__google-warning"]} role="alert">
          <span>Google Calendar 연결 상태를 확인하지 못했습니다.</span>
          <button
            type="button"
            onClick={() => googleConnectionQuery.refetch()}
            disabled={googleConnectionQuery.isFetching}
          >
            {googleConnectionQuery.isFetching ? "확인 중..." : "다시 시도"}
          </button>
        </div>
      ) : null}

      {effectiveGoogleConnection.available && googleEventsQuery.isError ? (
        <div className={styles["calendar__google-warning"]} role="alert">
          <span>
            {googleQueryNeedsReconnect
              ? "Google Calendar 재연결이 필요합니다."
              : googleEventsQuery.error instanceof Error
                ? googleEventsQuery.error.message
                : "Google 일정을 불러오지 못했습니다."}
          </span>
          <button
            type="button"
            onClick={() =>
              googleQueryNeedsReconnect
                ? setGoogleSettingsOpen(true)
                : googleEventsQuery.refetch()
            }
          >
            {googleQueryNeedsReconnect ? "재연결" : "다시 시도"}
          </button>
        </div>
      ) : effectiveGoogleConnection.available &&
        googleEventsQuery.data &&
        (googleEventsQuery.data.failedCalendarCount > 0 ||
          googleEventsQuery.data.truncated) ? (
        <p className={styles["calendar__google-warning"]} role="status">
          {googleEventsQuery.data.failedCalendarCount > 0
            ? `Google 캘린더 ${googleEventsQuery.data.failedCalendarCount}개의 일정을 불러오지 못했습니다.`
            : "Google 일정이 많아 일부만 표시합니다."}
        </p>
      ) : null}

      <div className={styles.calendar__body}>
        {selectedDate ? (
          <DateSessionsPanel
            dateKey={selectedDate}
            sessions={selectedDateSessions}
            googleEvents={selectedDateGoogleEvents}
            showGoogleSection={
              googleEventsEnabled && !googleQueryNeedsReconnect
            }
            focusedSessionId={focusedSessionId}
            members={members}
            currentUserDiscordId={currentUserDiscordId}
            onCreate={() => handleOpenCreate(selectedDate)}
            canCreate={selectedDateCanCreate}
            onOpenSession={handleOpenSessionDetail}
            onClose={() => {
              setSelectedDate(null);
              setFocusedSessionId(null);
            }}
          />
        ) : null}

        <section className={styles.calendar__board} aria-label="월간 캘린더">
          <div className={styles.calendar__weekdays}>
            {WEEKDAY_ICON_ITEMS.map((item) => (
              <div
                key={item.label}
                className={`${styles.calendar__weekday} ${
                  styles[item.toneClass]
                }`}
              >
                <span
                  className={styles["calendar__weekday-icon"]}
                  aria-hidden="true"
                >
                  <span className={styles["calendar__weekday-icon-top"]} />
                </span>
                <span
                  className={styles["calendar__weekday-text"]}
                  aria-hidden="true"
                >
                  {item.label}
                </span>
                <span className={styles["calendar__sr-only"]}>
                  {item.ariaLabel}
                </span>
              </div>
            ))}
          </div>

          <div className={styles.calendar__grid}>
            {grid.map((cell) => {
              const daySessions = sessionsByDate.get(cell.dateKey) ?? [];
              const dayGoogleEvents =
                googleEventsByDate.get(cell.dateKey) ?? [];
              const visible = daySessions.slice(
                0,
                MAX_VISIBLE_SESSIONS_PER_CELL,
              );
              const overflow = daySessions.length - visible.length;
              const isToday = cell.dateKey === todayKey;
              const isSelected = cell.dateKey === selectedDate;
              const canCreateOnDate = cell.dateKey >= todayKey;
              const holidayInfo = getKoreanHolidayInfo(cell.dateKey);
              const weekday = getKstWeekday(cell.dateKey);
              const dayToneClass = holidayInfo
                ? styles["calendar__cell-day--holiday"]
                : weekday === 0
                  ? styles["calendar__cell-day--sun"]
                  : weekday === 6
                    ? styles["calendar__cell-day--sat"]
                    : "";

              return (
                <div
                  key={cell.dateKey}
                  className={`${styles.calendar__cell} ${
                    cell.inMonth ? "" : styles["calendar__cell--out"]
                  } ${isToday ? styles["calendar__cell--today"] : ""} ${
                    isSelected ? styles["calendar__cell--selected"] : ""
                  }`}
                >
                  <div
                    className={styles["calendar__cell-head"]}
                  >
                    <span
                      className={styles["calendar__cell-date"]}
                    >
                      <span
                        className={`${styles["calendar__cell-day"]} ${dayToneClass}`}
                      >
                        {cell.day}
                      </span>
                      {holidayInfo ? (
                        <span className={styles["calendar__holiday-label"]}>
                          {holidayInfo.label}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className={styles["calendar__cell-add"]}
                      aria-label={`${cell.dateKey} 에 세션 추가`}
                      disabled={!canCreateOnDate}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenCreate(cell.dateKey);
                      }}
                    >
                      +
                    </button>
                  </div>

                  <ul className={styles["calendar__cell-sessions"]}>
                    {visible.map((s) => {
                      const isMine = isUserSession(s, currentUserDiscordId);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={`${styles.calendar__chip} ${
                              isMine ? styles["calendar__chip--mine"] : ""
                            }`}
                            onClick={() => handleOpenSessionDetail(s)}
                            aria-label={`${s.startTime} ${s.title} 세션 상세 열기`}
                          >
                            <span className={styles["calendar__chip-time"]}>
                              {s.startTime}
                            </span>
                            <span className={styles["calendar__chip-count"]}>
                              {s.participantDiscordIds.length}명
                            </span>
                            <span className={styles["calendar__chip-title"]}>
                              {s.title}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {overflow > 0 ? (
                      <li>
                        <button
                          type="button"
                          className={styles["calendar__chip-more"]}
                          onClick={() => handleSelectDate(cell.dateKey)}
                          aria-label={`${cell.dateKey} 세션 ${overflow}개 더 보기`}
                        >
                          <strong>+{overflow}개의 세션</strong>
                        </button>
                      </li>
                    ) : null}
                  </ul>

                  {dayGoogleEvents.length > 0 ? (
                    <button
                      type="button"
                      className={styles["calendar__google-summary"]}
                      onClick={() => handleSelectDate(cell.dateKey)}
                      aria-label={`${cell.dateKey} 개인 Google 일정 ${dayGoogleEvents.length}개 보기`}
                    >
                      <span
                        className={styles["calendar__google-dot"]}
                        style={{ backgroundColor: dayGoogleEvents[0].color }}
                        aria-hidden="true"
                      />
                      <span className={styles["calendar__google-label"]}>
                        {dayGoogleEvents[0].title}
                      </span>
                      <strong className={styles["calendar__google-count"]}>
                        <span className={styles["calendar__google-count-desktop"]}>
                          {dayGoogleEvents.length > 1
                            ? `+${dayGoogleEvents.length - 1}`
                            : "G"}
                        </span>
                        <span className={styles["calendar__google-count-mobile"]}>
                          G {dayGoogleEvents.length}
                        </span>
                      </strong>
                    </button>
                  ) : null}

                  {/* 셀의 빈 여백을 날짜 상세 진입점으로 사용한다. chip / + 버튼은
                      above z-index 로 가린다. */}
                  <button
                    type="button"
                    className={styles["calendar__cell-fill"]}
                    aria-label={`${cell.dateKey} 세션 목록 보기`}
                    onClick={() => handleSelectDate(cell.dateKey)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {createModalDate ? (
        <SessionCreateModal
          defaultDate={createModalDate}
          minDate={todayKey}
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
          minDate={todayKey}
          onClose={() => setDetailModalSession(null)}
        />
      ) : null}

      {googleSettingsOpen ? (
        <GoogleCalendarSettingsModal
          connection={effectiveGoogleConnection}
          connectionRetrying={googleConnectionQuery.isFetching}
          onClose={handleCloseGoogleSettings}
          onRetryConnection={() => googleConnectionQuery.refetch()}
        />
      ) : null}
    </main>
  );
}

interface DateSessionsPanelProps {
  dateKey: string;
  sessions: TrpgSessionView[];
  googleEvents: GoogleCalendarEventView[];
  showGoogleSection: boolean;
  focusedSessionId: string | null;
  members: TrpgMemberView[];
  currentUserDiscordId: string;
  onCreate: () => void;
  canCreate: boolean;
  onOpenSession: (session: TrpgSessionView) => void;
  onClose: () => void;
}

function DateSessionsPanel({
  dateKey,
  sessions,
  googleEvents,
  showGoogleSection,
  focusedSessionId,
  members,
  currentUserDiscordId,
  onCreate,
  canCreate,
  onOpenSession,
  onClose,
}: DateSessionsPanelProps) {
  const membersById = useMemo(() => {
    const map = new Map<string, TrpgMemberView>();
    for (const m of members) map.set(m.discordUserId, m);
    return map;
  }, [members]);

  return (
    <aside className={styles.dayPanel} aria-label={`${dateKey} 세션 정보`}>
      <header className={styles.dayPanel__header}>
        <div>
          <p className={styles.dayPanel__eyebrow}>선택한 날짜</p>
          <h2 className={styles.dayPanel__title}>{formatPanelDate(dateKey)}</h2>
        </div>
        <button
          className={styles.dayPanel__close}
          type="button"
          onClick={onClose}
          aria-label="날짜 정보 닫기"
        >
          ×
        </button>
      </header>

      <div className={styles.dayPanel__summary}>
        <strong>{sessions.length}</strong>
        <span>개 세션</span>
      </div>

      <button
        className={styles.dayPanel__create}
        type="button"
        onClick={onCreate}
        disabled={!canCreate}
      >
        + 이 날짜에 일정 생성
      </button>

      {sessions.length > 0 ? (
        <ul className={styles.dayPanel__list}>
          {sessions.map((session) => {
            const masterName =
              membersById.get(session.createdByDiscordId)?.displayName ??
              session.createdByUsername;
            const participantIds = session.participantDiscordIds.filter(
              (pid) => pid !== session.createdByDiscordId,
            );
            const isMine = isUserSession(session, currentUserDiscordId);

            return (
              <li
                key={session.id}
                className={`${styles.dayPanel__item} ${
                  session.id === focusedSessionId
                    ? styles["dayPanel__item--focused"]
                    : ""
                } ${isMine ? styles["dayPanel__item--mine"] : ""}`}
              >
                <button
                  className={styles.dayPanel__sessionButton}
                  type="button"
                  onClick={() => onOpenSession(session)}
                  aria-label={`${session.startTime} ${session.title} 세션 상세 열기`}
                >
                  <div className={styles.dayPanel__itemHeader}>
                    <span className={styles.dayPanel__time}>
                      {session.startTime}
                    </span>
                    <h3 className={styles.dayPanel__sessionTitle}>
                      {session.title}
                    </h3>
                  </div>

                  <dl className={styles.dayPanel__meta}>
                    <div className={styles.dayPanel__metaRow}>
                      <dt>마스터</dt>
                      <dd className={styles.dayPanel__master}>
                        <span>{masterName}</span>
                        {session.createdByDiscordId === currentUserDiscordId ? (
                          <span className={styles.dayPanel__selfBadge}>
                            본인
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div className={styles.dayPanel__metaRow}>
                      <dt>참여자</dt>
                      <dd>
                        {participantIds.length === 0 ? (
                          <span className={styles.dayPanel__emptyValue}>
                            없음
                          </span>
                        ) : (
                          <ul className={styles.dayPanel__participants}>
                            {participantIds.map((pid) => (
                              <li
                                key={pid}
                                className={`${styles.dayPanel__participant} ${
                                  pid === currentUserDiscordId
                                    ? styles["dayPanel__participant--self"]
                                    : ""
                                }`}
                              >
                                <span>
                                  {membersById.get(pid)?.displayName ??
                                    `(${pid})`}
                                </span>
                                {pid === currentUserDiscordId ? (
                                  <span className={styles.dayPanel__selfBadge}>
                                    본인
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </dd>
                    </div>
                  </dl>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.dayPanel__empty}>
          이 날짜에 등록된 세션이 없습니다.
        </p>
      )}

      {showGoogleSection ? (
        <section
          className={styles.dayPanel__google}
          aria-labelledby="day-panel-google-title"
        >
          <div className={styles["dayPanel__google-heading"]}>
            <h3 id="day-panel-google-title">내 Google 일정</h3>
            <span>{googleEvents.length}</span>
          </div>
          {googleEvents.length > 0 ? (
            <ul className={styles["dayPanel__google-list"]}>
              {googleEvents.map((event) => (
                <li key={event.id}>
                  {event.htmlLink ? (
                    <a
                      className={styles["dayPanel__google-event"]}
                      href={event.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span
                        className={styles["dayPanel__google-color"]}
                        style={{ backgroundColor: event.color }}
                        aria-hidden="true"
                      />
                      <span className={styles["dayPanel__google-time"]}>
                        {event.timeLabel}
                      </span>
                      <strong>{event.title}</strong>
                      <span aria-hidden="true">↗</span>
                    </a>
                  ) : (
                    <div className={styles["dayPanel__google-event"]}>
                      <span
                        className={styles["dayPanel__google-color"]}
                        style={{ backgroundColor: event.color }}
                        aria-hidden="true"
                      />
                      <span className={styles["dayPanel__google-time"]}>
                        {event.timeLabel}
                      </span>
                      <strong>{event.title}</strong>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles["dayPanel__google-empty"]}>
              이 날짜에 선택된 Google 일정이 없습니다.
            </p>
          )}
        </section>
      ) : null}
    </aside>
  );
}

function getGoogleCallbackMessage(status: string): string {
  switch (status) {
    case "denied":
      return "Google Calendar 연결 권한이 승인되지 않았습니다.";
    case "invalid-state":
      return "Google Calendar 연결 요청이 만료되었거나 올바르지 않습니다.";
    case "session-expired":
      return "로그인 세션이 만료되어 Google Calendar를 연결하지 못했습니다.";
    default:
      return "Google Calendar 연결에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }
}

function formatPanelDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday =
    WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${year}년 ${String(month).padStart(2, "0")}월 ${String(day).padStart(
    2,
    "0",
  )}일 (${weekday})`;
}
