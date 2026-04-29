"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  useSessionsByMonth,
  type SerializedSession,
  type SerializedSessionParticipant,
} from "@/hooks/queries/useSessionsQuery";
import type { ActiveSessionCounts } from "@/lib/db/sessions";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import SessionCalendar from "./SessionCalendar";

import {
  DOW_KO,
  STATUS_LABEL,
  buildDiscordLink,
  ddayLabel,
  ddayTone,
  formatDateMD,
  formatDuration,
  formatTime,
  inGroup,
  isAttending,
  matchesQuery,
  pad,
  statusModifier,
  type StatusGroup,
} from "./_utils";

import type { UpcomingSessionLink } from "./page";

import styles from "./page.module.css";

// 별도 모듈에서 사용할 수 있게 buildDiscordLink 재노출 (기존 호환).
export { buildDiscordLink };

export type ViewKey = "calendar" | "list";

interface SessionsClientProps {
  initialSessions: SerializedSession[];
  initialYear: number;
  initialMonth: number;
  guildId: string;
  initialUpcoming: UpcomingSessionLink[];
  /** STATUS 칩 카운트 — 월 무관 전체 활성 세션 기준 (서버에서 1회 fetch) */
  initialGlobalCounts: ActiveSessionCounts;
  /** 현재 로그인 유저 discord id — 응답 참여자 목록에서 본인 강조용. 미연결 유저는 null. */
  currentUserDiscordId: string | null;
}

interface TabDef {
  key: ViewKey;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { key: "calendar", label: "달력", icon: "▦" },
  { key: "list", label: "리스트", icon: "≡" },
];

interface StatusCounts {
  all: number;
  open: number;
  closed: number;
  cancel: number;
  mine: number;
}

export default function SessionsClient({
  initialSessions,
  initialYear,
  initialMonth,
  guildId,
  initialUpcoming,
  initialGlobalCounts,
  currentUserDiscordId,
}: SessionsClientProps) {
  const [view, setView] = useState<ViewKey>("calendar");
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [query, setQuery] = useState("");
  const [statusGroup, setStatusGroup] = useState<StatusGroup>("ALL");
  // 리스트 뷰의 펼친 row id — 캘린더에서 jump 진입 시 자동 expand 용도로도 사용.
  const [listExpandedId, setListExpandedId] = useState<string | null>(null);

  const isInitialMonth = year === initialYear && month === initialMonth;

  const { data: sessions = [] } = useSessionsByMonth(year, month, guildId, {
    initialData: isInitialMonth ? initialSessions : undefined,
  });

  const handlePrevMonth = useCallback(() => {
    setYear((y) => (month === 1 ? y - 1 : y));
    setMonth((m) => (m === 1 ? 12 : m - 1));
  }, [month]);

  const handleNextMonth = useCallback(() => {
    setYear((y) => (month === 12 ? y + 1 : y));
    setMonth((m) => (m === 12 ? 1 : m + 1));
  }, [month]);

  // 뷰 전환 시 STATUS 필터를 ALL 로 초기화 — 뷰별 STATUS 의미가 다르므로 끌고 가지 않는다.
  const changeView = useCallback((next: ViewKey) => {
    setView(next);
    setStatusGroup("ALL");
  }, []);

  // 캘린더 셀 클릭 → 리스트 뷰로 점프 + 해당 세션 자동 펼침. 펼친 row 가 viewport 로 스크롤된다.
  const jumpToListSession = useCallback((sessionId: string) => {
    setStatusGroup("ALL");
    setListExpandedId(sessionId);
    setView("list");
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  // 검색어만 적용한 결과 — 캘린더 뷰는 STATUS 필터를 강조용으로만 사용한다.
  const querySessions = useMemo(() => {
    if (!normalizedQuery) return sessions;
    return sessions.filter((s) => matchesQuery(s, normalizedQuery));
  }, [sessions, normalizedQuery]);

  // 검색어 + STATUS 필터 모두 적용한 결과 — 리스트/어젠다 뷰에서 사용한다.
  const filteredSessions = useMemo(() => {
    if (statusGroup === "ALL") return querySessions;
    return querySessions.filter((s) => inGroup(s, statusGroup));
  }, [querySessions, statusGroup]);

  const counts = useMemo<StatusCounts>(() => {
    let all = 0;
    let open = 0;
    let closed = 0;
    let cancel = 0;
    let mine = 0;
    for (const s of sessions) {
      all += 1;
      if (s.status === "OPEN" || s.status === "CLOSING") open += 1;
      else if (s.status === "CLOSED") closed += 1;
      else if (s.status === "CANCELING" || s.status === "CANCELED") cancel += 1;
      if (isAttending(s)) mine += 1;
    }
    return { all, open, closed, cancel, mine };
  }, [sessions]);

  const myRsvpUpcoming = useMemo(() => {
    // 24h 미만 세션 필터링용 cutoff — useMemo deps 가 sessions 라 매 렌더 재계산되지 않음.
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return sessions
      .filter(
        (s) =>
          s.myRsvp === "YES" &&
          s.status !== "CANCELED" &&
          new Date(s.targetDateTime).getTime() >= cutoff,
      )
      .sort(
        (a, b) =>
          new Date(a.targetDateTime).getTime() -
          new Date(b.targetDateTime).getTime(),
      );
  }, [sessions]);

  const prevLabel = `${month === 1 ? 12 : month - 1}월`;
  const nextLabel = `${month === 12 ? 1 : month + 1}월`;

  const titleNode: ReactNode = (
    <span className={styles.titleRow}>
      세션{" "}
      <span className={styles.headMeta}>
        <b>{counts.all}</b> SCHEDULED · {year}.{pad(month)}
      </span>
    </span>
  );

  return (
    <>
      <PageHead
        breadcrumb="ERP / SESSIONS"
        title={titleNode}
        right={
          <Button as="a" href="/erp/sessions/report" variant="primary">
            리포트 →
          </Button>
        }
      />

      <div className={styles.ctrl}>
        <div className={styles.ctrlRow}>
          <div className={styles.ctrlSeg} role="tablist">
            {TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                className={view === key ? styles.on : undefined}
                onClick={() => changeView(key)}
              >
                <span className={styles.ico}>{icon}</span>
                {label}
              </button>
            ))}
          </div>

          <div className={styles.ctrlSearch}>
            <span className={styles.icn}>⌕</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="작전명 · 참여자 codename · 닉네임 검색"
              aria-label="세션 검색"
            />
          </div>

          <div className={styles.ctrlMonth}>
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="이전 월"
            >
              ‹ {prevLabel}
            </button>
            <span className={styles.lbl}>
              {year} · {pad(month)}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="다음 월"
            >
              {nextLabel} ›
            </button>
          </div>
        </div>

        <div className={`${styles.ctrlRow} ${styles["ctrlRow--r2"]}`}>
          <div className={styles.ctrlStatus}>
            <span className={styles.ctrlStatusLbl}>STATUS</span>
            <div className={styles.pillgroup}>
              <StatusPill
                on={statusGroup === "ALL"}
                onClick={() => setStatusGroup("ALL")}
              >
                ALL · {initialGlobalCounts.all}
              </StatusPill>
              <StatusPill
                mod="open"
                on={statusGroup === "open"}
                onClick={() => setStatusGroup("open")}
              >
                모집중 · {initialGlobalCounts.open}
              </StatusPill>
              <StatusPill
                mod="closed"
                on={statusGroup === "closed"}
                onClick={() => setStatusGroup("closed")}
              >
                확정 · {initialGlobalCounts.closed}
              </StatusPill>
              <StatusPill
                mod="cancel"
                on={statusGroup === "cancel"}
                onClick={() => setStatusGroup("cancel")}
              >
                취소 · {initialGlobalCounts.cancel}
              </StatusPill>
              <StatusPill
                mod="mine"
                on={statusGroup === "mine"}
                onClick={() => setStatusGroup("mine")}
              >
                내 참여 · {initialGlobalCounts.mine}
              </StatusPill>
            </div>
            {view === "calendar" && statusGroup !== "ALL" ? (
              <span className={styles.ctrlStatusHint}>
                캘린더에서는 강조만 적용 · 분류 결과는 ≡ 리스트 뷰
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.notice} role="note">
        <span className={styles.lbl}>BOT-OPS</span>
        <span>
          세션 생성·마감·취소는 <span className={styles.cmd}>/일정</span>{" "}
          디스코드 내 <span className={styles.cmd}>레지스트라</span> 전용 커맨드입니다. 해당 페이지는 참여 현황과 리포트 작성만 지원 합니다.
        </span>
      </div>

      <div
        className={[
          styles.body,
          view === "calendar" ? styles["body--full"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <main>
          {view === "calendar" ? (
            <SessionCalendar
              sessions={querySessions}
              year={year}
              month={month}
              highlightGroup={statusGroup}
              onDayClick={jumpToListSession}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
            />
          ) : null}

          {view === "list" ? (
            <SessionsList
              sessions={filteredSessions}
              year={year}
              month={month}
              expandedId={listExpandedId}
              onExpandedChange={setListExpandedId}
              currentUserDiscordId={currentUserDiscordId}
            />
          ) : null}
        </main>

        {view !== "calendar" ? (
          <SessionsRail
            counts={counts}
            myRsvp={myRsvpUpcoming}
            openImminent={initialUpcoming}
          />
        ) : null}
      </div>
    </>
  );
}

/* ── Status pill ── */

interface StatusPillProps {
  on: boolean;
  mod?: "open" | "closed" | "cancel" | "mine";
  onClick: () => void;
  children: ReactNode;
}

function StatusPill({ on, mod, onClick, children }: StatusPillProps) {
  const cls = [
    styles.pill,
    mod ? styles[`pill--${mod}`] : "",
    on ? styles["pill--on"] : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={on}
      onClick={onClick}
    >
      <span className={styles.dot} aria-hidden /> {children}
    </button>
  );
}

/* ── List view ── */

interface SessionsListProps {
  sessions: SerializedSession[];
  year: number;
  month: number;
  expandedId: string | null;
  onExpandedChange: (next: string | null) => void;
  currentUserDiscordId: string | null;
}

function SessionsList({
  sessions,
  year,
  month,
  expandedId,
  onExpandedChange,
  currentUserDiscordId,
}: SessionsListProps) {
  const [upcomingOnly, setUpcomingOnly] = useState(false);

  // "다가올만" 토글 적용 후 화면에 보일 세션. cutoff 는 어제 자정 (D+1 의 어젯밤 세션도 포함).
  const visibleSessions = useMemo(() => {
    if (!upcomingOnly) return sessions;
    const now = new Date();
    const cutoff =
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      24 * 60 * 60 * 1000;
    return sessions.filter(
      (s) => new Date(s.targetDateTime).getTime() >= cutoff,
    );
  }, [sessions, upcomingOnly]);

  const visibleCounts = useMemo(() => {
    let open = 0;
    let closed = 0;
    for (const s of visibleSessions) {
      if (s.status === "OPEN" || s.status === "CLOSING") open += 1;
      else if (s.status === "CLOSED") closed += 1;
    }
    return { open, closed };
  }, [visibleSessions]);

  return (
    <div className={styles.list}>
      <div className={styles.listMonth}>
        <span className={styles.ym}>
          SESSION LIST · {year}.{pad(month)}
        </span>
        <span className={styles.cnt}>
          {visibleSessions.length} 건 · 모집중 {visibleCounts.open} · 확정{" "}
          {visibleCounts.closed}
        </span>
        <button
          type="button"
          className={[
            styles.listFilter,
            upcomingOnly ? styles["listFilter--on"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setUpcomingOnly((prev) => !prev)}
          aria-pressed={upcomingOnly}
        >
          {upcomingOnly ? "✓ " : ""}다가올만
        </button>
      </div>
      {visibleSessions.length === 0 ? (
        <div className={styles.empty}>
          {upcomingOnly
            ? "다가올 세션이 없습니다."
            : "해당 조건의 세션이 없습니다."}
        </div>
      ) : (
        <>
          <div className={styles.listHead}>
            <div>STATUS</div>
            <div>작전명</div>
            <div>일시</div>
            <div style={{ textAlign: "right" }}>응답</div>
          </div>
          {visibleSessions.map((s) => (
            <SessionsListItem
              key={s._id}
              session={s}
              expanded={expandedId === s._id}
              onToggle={() =>
                onExpandedChange(expandedId === s._id ? null : s._id)
              }
              currentUserDiscordId={currentUserDiscordId}
            />
          ))}
        </>
      )}
    </div>
  );
}

interface SessionsListItemProps {
  session: SerializedSession;
  expanded: boolean;
  onToggle: () => void;
  currentUserDiscordId: string | null;
}

function SessionsListItem({
  session: s,
  expanded,
  onToggle,
  currentUserDiscordId,
}: SessionsListItemProps) {
  const itemRef = useRef<HTMLDivElement | null>(null);

  // expanded 가 true 로 바뀐 직후(외부 jump 또는 수동 토글) 해당 row 로 부드럽게 스크롤.
  useEffect(() => {
    if (expanded && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [expanded]);

  const mod = statusModifier(s.status);
  const rowCls = [
    styles.listRow,
    mod ? styles[`listRow--${mod}`] : "",
    expanded ? styles["listRow--expanded"] : "",
  ]
    .filter(Boolean)
    .join(" ");
  const statCls = [
    styles.listStat,
    mod ? styles[`listStat--${mod}`] : "",
  ]
    .filter(Boolean)
    .join(" ");
  const target = new Date(s.targetDateTime);
  const dow = DOW_KO[target.getDay()];
  const dur = formatDuration(s.targetDateTime, s.closeDateTime);

  const yesParticipants = s.participants.filter((p) => p.status === "YES");

  return (
    <div ref={itemRef} className={styles.listItem}>
      <button
        type="button"
        className={rowCls}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className={statCls}>{STATUS_LABEL[s.status]}</div>
        <div className={styles.listName}>
          <div className={styles.row1}>
            {isAttending(s) ? (
              <span className={styles.me} aria-label="내 참여" />
            ) : null}
            <span className={styles.nm}>{s.title}</span>
          </div>
        </div>
        <div className={styles.listWhen}>
          <span className={styles.top}>
            {formatDateMD(s.targetDateTime)} · {dow} ·{" "}
            {formatTime(s.targetDateTime)}
          </span>
          {dur ? <span className={styles.sub}>소요 {dur}</span> : null}
        </div>
        <div className={styles.listRsvp}>
          <span className={styles.y}>{s.counts.yes}</span>
          <span className={styles.lbl}>응답</span>
          <span className={styles.caret} aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {expanded ? (
        <div className={styles.listAccordion}>
          <dl className={styles.listInfo}>
            <div className={styles.listInfo__row}>
              <dt>시작</dt>
              <dd>
                {formatDateMD(s.targetDateTime)} · {dow} ·{" "}
                {formatTime(s.targetDateTime)}
              </dd>
            </div>
            <div className={styles.listInfo__row}>
              <dt>응답 마감</dt>
              <dd>
                {formatDateMD(s.closeDateTime)} ·{" "}
                {formatTime(s.closeDateTime)}
              </dd>
            </div>
            {dur ? (
              <div className={styles.listInfo__row}>
                <dt>소요</dt>
                <dd>{dur}</dd>
              </div>
            ) : null}
            <div className={styles.listInfo__row}>
              <dt>상태</dt>
              <dd className={statCls}>{STATUS_LABEL[s.status]}</dd>
            </div>
          </dl>

          <div className={styles.listParticipants}>
            <ParticipantGroup
              label="응답 참여자"
              items={yesParticipants}
              currentUserDiscordId={currentUserDiscordId}
            />
          </div>

          <div className={styles.listActions}>
            <Link
              href={buildDiscordLink(s)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.listAction}
            >
              디스코드 공지사항으로 이동 →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface ParticipantGroupProps {
  label: string;
  items: SerializedSessionParticipant[];
  currentUserDiscordId: string | null;
}

function ParticipantGroup({
  label,
  items,
  currentUserDiscordId,
}: ParticipantGroupProps) {
  return (
    <div className={styles.listParticipants__group}>
      <div className={styles.listParticipants__head}>
        <span className={styles.listParticipants__lbl}>{label}</span>
        <span className={styles.listParticipants__cnt}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className={styles.listParticipants__empty}>—</div>
      ) : (
        <ul className={styles.listParticipants__list}>
          {items.map((p) => {
            const isMe =
              currentUserDiscordId !== null &&
              p.userId === currentUserDiscordId;
            const itemCls = [
              styles.listParticipants__item,
              isMe ? styles["listParticipants__item--me"] : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={p.userId} className={itemCls}>
                <span className={styles.listParticipants__name}>
                  {p.displayName}
                </span>
                {p.codename ? (
                  <span className={styles.listParticipants__cn}>
                    · {p.codename}
                  </span>
                ) : null}
                {isMe ? (
                  <span className={styles.listParticipants__meTag}>나</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── Right rail ── */

interface SessionsRailProps {
  counts: StatusCounts;
  myRsvp: SerializedSession[];
  openImminent: UpcomingSessionLink[];
}

function SessionsRail({ counts, myRsvp, openImminent }: SessionsRailProps) {
  return (
    <aside className={styles.rail}>
      <div className={styles.statStrip}>
        <div className={styles.statCell}>
          <div className={styles.statKey}>이번 달</div>
          <div className={styles.statVal}>
            {counts.all}
            <small>회</small>
          </div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.statKey}>내 응답</div>
          <div className={styles.statVal}>
            {counts.mine}
            <small>건</small>
          </div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.statKey}>모집중</div>
          <div className={styles.statVal}>
            {counts.open}
            <small>건</small>
          </div>
        </div>
      </div>

      <div className={styles.railCard}>
        <div className={styles.railHead}>
          <span>내 응답 · 다가올</span>
          <span className={styles.cnt}>{myRsvp.length}</span>
        </div>
        {myRsvp.length === 0 ? (
          <div className={styles.empty}>예정된 참여 세션 없음</div>
        ) : (
          <div className={styles.myrsvp}>
            {myRsvp.map((s) => {
              const d = new Date(s.targetDateTime);
              const dow = DOW_KO[d.getDay()];
              const tone = ddayTone(s.targetDateTime);
              const cdCls = [
                styles.rsvpCd,
                tone ? styles[`rsvpCd--${tone}`] : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <Link
                  key={s._id}
                  href={buildDiscordLink(s)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.rsvpItem}
                >
                  <div className={styles.rsvpWhen}>
                    <div className={styles.d}>{d.getDate()}</div>
                    <div className={styles.m}>
                      {pad(d.getMonth() + 1)}월 · {dow}
                    </div>
                  </div>
                  <div className={styles.rsvpBody}>
                    <div className={styles.rsvpName}>{s.title}</div>
                    <div className={styles.rsvpMeta}>
                      <span className={styles.t}>
                        {formatTime(s.targetDateTime)}
                      </span>{" "}
                      · 응답 {s.counts.yes}
                    </div>
                  </div>
                  <div className={cdCls}>{ddayLabel(s.targetDateTime)}</div>
                </Link>
              );
            })}
          </div>
        )}

        <div className={styles.railSep}>OPEN · 임박</div>
        {openImminent.length === 0 ? (
          <div className={styles.empty}>열려있는 세션 없음</div>
        ) : (
          openImminent.map((s) => {
            const tone = ddayTone(s.targetDateTime);
            const cdCls = [
              styles.openCd,
              tone === "urgent" ? styles["openCd--urgent"] : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <Link
                key={s._id}
                href={buildDiscordLink(s)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openItem}
              >
                <div>
                  <div className={styles.openName}>{s.title}</div>
                  <div className={styles.openMeta}>
                    {formatDateMD(s.targetDateTime)} ·{" "}
                    {formatTime(s.targetDateTime)}
                  </div>
                </div>
                <div className={cdCls}>{ddayLabel(s.targetDateTime)}</div>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
