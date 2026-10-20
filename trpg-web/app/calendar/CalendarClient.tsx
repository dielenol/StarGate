"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import { MemberAvatar } from "@/app/roulette/MemberAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import {
  useGoogleCalendarConnection,
  useGoogleCalendarEvents,
} from "@/hooks/queries/useGoogleCalendar";
import { useTrpgMembers } from "@/hooks/queries/useTrpgMembers";
import { useTrpgSessions } from "@/hooks/queries/useTrpgSessions";
import { yearMonthFromDateKey } from "@/lib/calendar/date-key";
import { formatKoreanDate } from "@/lib/calendar/format";
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
import { resolveMemberName } from "@/lib/trpg/member-name";
import type { TrpgSessionView } from "@/lib/trpg/serializer";

import { GoogleCalendarSettingsModal } from "./GoogleCalendarSettingsModal";
import { SessionCreateModal } from "./SessionCreateModal";
import { SessionDetailModal } from "./SessionDetailModal";

import styles from "./styles.module.css";

const WEEKDAY_ICON_ITEMS = [
  { label: "Sun", ariaLabel: "일요일", toneClass: "calendar__weekday--sun" },
  { label: "Mon", ariaLabel: "월요일", toneClass: "calendar__weekday--mon" },
  { label: "Tue", ariaLabel: "화요일", toneClass: "calendar__weekday--tue" },
  { label: "Wed", ariaLabel: "수요일", toneClass: "calendar__weekday--wed" },
  { label: "Thu", ariaLabel: "목요일", toneClass: "calendar__weekday--thu" },
  { label: "Fri", ariaLabel: "금요일", toneClass: "calendar__weekday--fri" },
  { label: "Sat", ariaLabel: "토요일", toneClass: "calendar__weekday--sat" },
] as const;
/** 셀에 노출하는 세션 칩 수. 초과분은 "+N" 으로 접는다. */
const MAX_VISIBLE_SESSIONS_PER_CELL = 2;
/**
 * 모바일(≤767px) 셀에 노출하는 칩 수. 초과 칩의 li 에
 * `calendar__cell-session--wide-only` 를 붙여 모바일에서 숨긴다.
 */
const COMPACT_VISIBLE_SESSIONS_PER_CELL = 1;

interface Props {
  currentUserDiscordId: string;
  /** 로그인 세션의 Discord 이름 — 길드 멤버 캐시에 본인이 없을 때 ID 대신 보여준다. */
  currentUserName?: string | null;
  initialYear: number;
  initialMonth: number;
  /**
   * 요청 시점의 KST 오늘 날짜 키(`YYYY-MM-DD`). 서버 page 가 계산해 내려준다 —
   * 오늘 링·지난 날짜 셀·생성 가드·패널 안내가 SSR 과 hydration 에서 같은 값을 본다.
   */
  todayKey: string;
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

/** 셀 여백 버튼의 접근 가능한 이름. 패널을 닫은 뒤 포커스를 돌려줄 때 같은 문자열로 찾는다. */
function dateCellButtonLabel(dateKey: string): string {
  return `${dateKey} 세션 목록 보기`;
}

export function CalendarClient({
  currentUserDiscordId,
  currentUserName = null,
  initialYear,
  initialMonth,
  todayKey,
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [googleSettingsOpen, setGoogleSettingsOpen] = useState(
    initialGoogleStatus === "connected",
  );
  const accountRef = useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const accountMenuId = useId();
  const [googleCallbackStatus] = useState(initialGoogleStatus);
  const [detailModalSession, setDetailModalSession] =
    useState<TrpgSessionView | null>(
      () =>
        initialSessions.find((session) => session.id === initialFocusedSessionId) ??
        null,
    );

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

  // 계정 메뉴는 비모달 disclosure — 바깥 pointerdown 과 Esc 로 닫는다. Esc 는 document 에서 받는다:
  // macOS Safari/Firefox 는 버튼 클릭에 포커스를 주지 않아 래퍼의 onKeyDown 에는 키가 닿지 않는다.
  // Tab 이탈은 래퍼의 onBlur 가 맡는다.
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.isComposing ||
        event.defaultPrevented
      ) {
        return;
      }
      const active = document.activeElement;
      // 포커스가 메뉴 밖의 다른 위젯에 있으면 그쪽 Esc 에 양보한다.
      if (
        active &&
        active !== document.body &&
        !accountRef.current?.contains(active)
      ) {
        return;
      }
      event.preventDefault();
      setAccountMenuOpen(false);
      accountTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  // 탭을 자정 넘겨 둔 채 다시 보이면 서버가 내려준 todayKey 가 어제로 남는다 — KST 날짜가 바뀌었으면
  // 서버 컴포넌트를 다시 실행해 새 todayKey(와 prefetch)를 받는다. 클라이언트에서 todayKey 를
  // 다시 계산하지 않는 이유: 과거 날짜 거부는 서버 API 가 자기 시계로 하므로 기준은 서버 하나여야
  // 하고, 시계가 틀린 기기도 서버 값만 쓰게 된다. refresh 는 선택 날짜·열린 모달 같은 클라이언트
  // 상태를 유지한다.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (currentKstDateString() === todayKey) return;
      router.refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router, todayKey]);

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
  const selectedDateIsPast = selectedDate ? selectedDate < todayKey : false;
  const isModalOpen =
    createModalDate !== null ||
    detailModalSession !== null ||
    googleSettingsOpen;
  const currentUserDisplayName =
    currentMember?.displayName ?? currentUserName ?? currentUserDiscordId;

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
    // "오늘" 의 출처는 서버가 내려준 todayKey 하나다 — 클라이언트 시계로 달을 고르면
    // 자정을 넘긴 탭에서 오늘 링이 없는 달로 이동한다.
    setYearMonth(yearMonthFromDateKey(todayKey) ?? currentKstYearMonth());
  }

  async function handleSignOut() {
    try {
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      // signout POST 가 네트워크 오류이거나 JSON 이 아닌 응답이면 여기로 온다 — 메뉴를 열어 둔 채 알린다.
      // CSRF 조회 실패는 next-auth 가 삼키고 서버가 /login?error=MissingCSRF 로 보낸다(로그인 화면이 표시).
      console.error("[trpg-web] 로그아웃 실패", error);
      showToast("로그아웃에 실패했습니다. 다시 시도해주세요.");
    }
  }

  function handleAccountBlur(event: React.FocusEvent<HTMLDivElement>) {
    // Safari 는 버튼 클릭 때 relatedTarget 이 null 이라 여기서 닫으면 메뉴 항목 클릭이 유실된다.
    // null 은 무시하고(바깥 클릭은 pointerdown 리스너가 처리) 키보드 Tab 이탈만 닫는다.
    const next = event.relatedTarget;
    if (next instanceof Node && !accountRef.current?.contains(next)) {
      setAccountMenuOpen(false);
    }
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

  function handleClosePanel() {
    const closedDate = selectedDate;
    setSelectedDate(null);
    setFocusedSessionId(null);
    // 패널이 언마운트되면 닫기 버튼에 있던 포커스가 body 로 떨어진다 — 다음 프레임에
    // 닫기 직전 날짜의 셀 버튼으로 돌려준다. 모달이 열려 있으면 포커스는 모달 안에 있고
    // 모달이 닫힐 때 스스로 복원하므로 건드리지 않는다.
    if (closedDate === null || isModalOpen) return;
    requestAnimationFrame(() => {
      // 그사이 사용자가 다른 곳에 포커스를 줬으면 가로채지 않는다.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      gridRef.current
        ?.querySelector<HTMLButtonElement>(
          `button[aria-label="${dateCellButtonLabel(closedDate)}"]`,
        )
        ?.focus();
    });
  }

  const handleCloseGoogleSettings = useCallback(() => {
    setGoogleSettingsOpen(false);
  }, []);

  return (
    <main
      className={`${styles.calendar} ${
        selectedDate ? styles["calendar--panel-open"] : ""
      }`}
    >
      <header className={styles.calendar__header}>
        <div className={styles.calendar__month}>
          <button
            className={styles.calendar__nav}
            type="button"
            onClick={handlePrev}
            aria-label="이전 달"
          >
            ‹
          </button>
          <h1 className={styles.calendar__title}>
            {year}년 {String(month).padStart(2, "0")}월
          </h1>
          <button
            className={styles.calendar__nav}
            type="button"
            onClick={handleNext}
            aria-label="다음 달"
          >
            ›
          </button>
          <button
            className={styles.calendar__today}
            type="button"
            onClick={handleToday}
          >
            오늘로
          </button>
        </div>

        <div className={styles.calendar__tools}>
          <Link className={styles.calendar__roulette} href="/roulette">
            <span aria-hidden="true">●</span>
            다채 룰렛
          </Link>
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
          <div
            className={styles.calendar__filter}
            role="group"
            aria-label="세션 필터"
          >
            <button
              className={styles["calendar__filter-option"]}
              type="button"
              aria-pressed={!showMineOnly}
              onClick={() => setShowMineOnly(false)}
            >
              전체
            </button>
            <button
              className={`${styles["calendar__filter-option"]} ${
                styles["calendar__filter-option--mine"]
              }`}
              type="button"
              aria-pressed={showMineOnly}
              onClick={() => setShowMineOnly(true)}
            >
              내 세션
            </button>
          </div>
        </div>

        <div className={styles.calendar__actions}>
          <button
            className={styles["calendar__create-btn"]}
            type="button"
            onClick={() => handleOpenCreate()}
          >
            <span className={styles["calendar__create-icon"]} aria-hidden="true">
              +
            </span>
            <span className={styles["calendar__create-label"]}>일정 생성</span>
          </button>
          {/* 프로필·테마·로그아웃은 disclosure 메뉴로 모은다 — 모바일 헤더를 2줄로 유지. */}
          <div
            className={styles.calendar__account}
            ref={accountRef}
            onBlur={handleAccountBlur}
          >
            <button
              className={styles.calendar__profile}
              type="button"
              ref={accountTriggerRef}
              aria-label={`${currentUserDisplayName} 계정 메뉴`}
              aria-expanded={accountMenuOpen}
              aria-controls={accountMenuOpen ? accountMenuId : undefined}
              onClick={() => setAccountMenuOpen((prev) => !prev)}
            >
              <MemberAvatar
                avatarUrl={currentMember?.avatarUrl ?? null}
                discordUserId={currentUserDiscordId}
                name={currentUserDisplayName}
                size={22}
                className={styles["calendar__profile-avatar"]}
              />
              <span className={styles["calendar__profile-name"]}>
                {currentUserDisplayName}
              </span>
              <span className={styles["calendar__profile-caret"]} aria-hidden="true">
                ▾
              </span>
            </button>
            {accountMenuOpen ? (
              <div
                id={accountMenuId}
                className={styles["calendar__account-menu"]}
              >
                <p className={styles["calendar__account-identity"]}>
                  <span className={styles["calendar__account-eyebrow"]}>
                    로그인 계정
                  </span>
                  <span className={styles["calendar__account-name"]}>
                    {currentUserDisplayName}
                  </span>
                </p>
                <div className={styles["calendar__account-row"]}>
                  <span>테마</span>
                  <ThemeToggle />
                </div>
                <button
                  className={styles["calendar__sign-out"]}
                  type="button"
                  onClick={handleSignOut}
                >
                  로그아웃
                </button>
              </div>
            ) : null}
          </div>
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

          <div className={styles.calendar__grid} ref={gridRef}>
            {grid.map((cell) => {
              const daySessions = sessionsByDate.get(cell.dateKey) ?? [];
              const dayGoogleEvents =
                googleEventsByDate.get(cell.dateKey) ?? [];
              const visible = daySessions.slice(
                0,
                MAX_VISIBLE_SESSIONS_PER_CELL,
              );
              const overflow = daySessions.length - visible.length;
              const compactOverflow = Math.max(
                0,
                daySessions.length - COMPACT_VISIBLE_SESSIONS_PER_CELL,
              );
              const isToday = cell.dateKey === todayKey;
              const isSelected = cell.dateKey === selectedDate;
              const isPast = cell.dateKey < todayKey;
              const canCreateOnDate = !isPast;
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
                  } ${isPast ? styles["calendar__cell--past"] : ""} ${
                    isToday ? styles["calendar__cell--today"] : ""
                  } ${isSelected ? styles["calendar__cell--selected"] : ""}`}
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
                    {visible.map((s, index) => {
                      const isMine = isUserSession(s, currentUserDiscordId);
                      return (
                        <li
                          key={s.id}
                          className={
                            index >= COMPACT_VISIBLE_SESSIONS_PER_CELL
                              ? styles["calendar__cell-session--wide-only"]
                              : undefined
                          }
                        >
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
                    {compactOverflow > 0 ? (
                      <li
                        className={
                          overflow > 0
                            ? undefined
                            : styles["calendar__cell-more--compact-only"]
                        }
                      >
                        {/* 브레이크포인트마다 노출 칩 수가 달라 "+N" 값도 다르다.
                            접근 가능한 이름은 보이는 텍스트 + sr-only 문구로 구성하고
                            aria-label 은 쓰지 않는다. */}
                        <button
                          type="button"
                          className={styles["calendar__chip-more"]}
                          onClick={() => handleSelectDate(cell.dateKey)}
                        >
                          <span className={styles["calendar__sr-only"]}>
                            {cell.dateKey}{" "}
                          </span>
                          <strong className={styles["calendar__chip-more-desktop"]}>
                            +{overflow}개의 세션
                          </strong>
                          <strong className={styles["calendar__chip-more-mobile"]}>
                            +{compactOverflow}
                            <span className={styles["calendar__sr-only"]}>
                              개의 세션
                            </span>
                          </strong>
                          <span className={styles["calendar__sr-only"]}>
                            {" "}더 보기
                          </span>
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
                          {/* 두 자리는 핀 폭(날짜 숫자 옆 ≈22px)에 안 들어간다 — 정확한 수는 aria-label 에 있다. */}
                          {dayGoogleEvents.length > 9
                            ? "G+"
                            : `G${dayGoogleEvents.length}`}
                        </span>
                      </strong>
                    </button>
                  ) : null}

                  {/* 셀의 빈 여백을 날짜 상세 진입점으로 사용한다. chip / + 버튼은
                      above z-index 로 가린다. */}
                  <button
                    type="button"
                    className={styles["calendar__cell-fill"]}
                    aria-label={dateCellButtonLabel(cell.dateKey)}
                    onClick={() => handleSelectDate(cell.dateKey)}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* 데스크톱(≥1280px)은 오른쪽 열을 항상 예약해 날짜를 눌러도 그리드가 밀리지 않는다.
            그 아래 폭에서는 패널이 바텀시트로 뜨고 플레이스홀더는 CSS 가 숨긴다. */}
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
            currentUserName={currentUserName}
            onCreate={() => handleOpenCreate(selectedDate)}
            isPastDate={selectedDateIsPast}
            onOpenSession={handleOpenSessionDetail}
            onClose={handleClosePanel}
          />
        ) : (
          <div
            className={`${styles.dayPanel} ${styles["dayPanel--placeholder"]}`}
          >
            <p className={styles.dayPanel__eyebrow}>날짜를 선택하세요</p>
            <p className={styles["dayPanel__placeholder-text"]}>
              달력에서 날짜를 누르면 그날의 세션과 Google 일정이 여기에
              표시됩니다.
            </p>
          </div>
        )}
      </div>

      {createModalDate ? (
        <SessionCreateModal
          defaultDate={createModalDate}
          minDate={todayKey}
          members={members}
          existingSessions={sessions}
          currentUserDiscordId={currentUserDiscordId}
          currentUserName={currentUserName}
          onClose={() => setCreateModalDate(null)}
        />
      ) : null}

      {detailModalSession ? (
        <SessionDetailModal
          session={detailModalSession}
          members={members}
          existingSessions={sessions}
          currentUserDiscordId={currentUserDiscordId}
          currentUserName={currentUserName}
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
  currentUserName: string | null;
  onCreate: () => void;
  /** 오늘 이전 날짜 — 생성 버튼 대신 안내 문구를 보여준다. */
  isPastDate: boolean;
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
  currentUserName,
  onCreate,
  isPastDate,
  onOpenSession,
  onClose,
}: DateSessionsPanelProps) {
  const membersById = useMemo(() => {
    const map = new Map<string, TrpgMemberView>();
    for (const m of members) map.set(m.discordUserId, m);
    return map;
  }, [members]);
  const currentUser = { discordId: currentUserDiscordId, name: currentUserName };

  return (
    <aside
      className={`${styles.dayPanel} ${
        isPastDate ? styles["dayPanel--past"] : ""
      }`}
      aria-label={`${dateKey} 세션 정보`}
    >
      <header className={styles.dayPanel__header}>
        <div>
          <p className={styles.dayPanel__eyebrow}>
            {isPastDate ? "지난 날짜" : "선택한 날짜"}
          </p>
          <h2 className={styles.dayPanel__title}>{formatKoreanDate(dateKey)}</h2>
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

      {isPastDate ? (
        <p className={styles.dayPanel__notice}>
          지난 날짜에는 일정을 만들 수 없습니다.
        </p>
      ) : (
        <button
          className={styles.dayPanel__create}
          type="button"
          onClick={onCreate}
        >
          + 이 날짜에 일정 생성
        </button>
      )}

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
                                  {resolveMemberName(membersById, pid, currentUser)}
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
