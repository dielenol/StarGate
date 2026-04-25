"use client";

import { useMemo, useState } from "react";

import type { SessionStatus } from "@/types/session";

import {
  useSessionsByMonth,
  type SerializedSession,
} from "@/hooks/queries/useSessionsQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Select from "@/components/ui/Select/Select";
import Tag from "@/components/ui/Tag/Tag";

import SessionCalendar from "./SessionCalendar";

import type { UpcomingSessionLink } from "./page";

import styles from "./page.module.css";

type TabKey = "calendar" | "list";

interface TabDef {
  key: TabKey;
  label: string;
}

const MY_RSVP_UPCOMING_LIMIT = 5;

const TABS: TabDef[] = [
  { key: "calendar", label: "달력" },
  { key: "list", label: "리스트" },
];

const STATUS_TAG: Record<
  SessionStatus,
  { label: string; tone: "gold" | "info" | "success" | "danger" | "default" }
> = {
  OPEN: { label: "모집중", tone: "gold" },
  CLOSING: { label: "마감 임박", tone: "info" },
  CLOSED: { label: "확정", tone: "success" },
  CANCELING: { label: "취소 예정", tone: "danger" },
  CANCELED: { label: "취소됨", tone: "danger" },
};

const STATUS_FILTER_OPTIONS: Array<{
  value: "ALL" | SessionStatus;
  label: string;
}> = [
  { value: "ALL", label: "상태: 전체" },
  { value: "OPEN", label: "모집중" },
  { value: "CLOSING", label: "마감 임박" },
  { value: "CLOSED", label: "확정" },
  { value: "CANCELING", label: "취소 예정" },
  { value: "CANCELED", label: "취소됨" },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} · ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 디스코드 메시지 딥링크. messageId가 비어있으면 채널 URL로 fallback.
 */
export function buildDiscordLink(opts: {
  guildId: string;
  channelId: string;
  messageId?: string;
}): string {
  const { guildId, channelId, messageId } = opts;
  if (messageId && messageId.trim().length > 0) {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
  }
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

/**
 * 검색어 q로 세션 매칭. title, 참여자 codename/displayName 전부 대상.
 * q는 이미 trim + toLowerCase 된 값 가정.
 */
function matchesQuery(s: SerializedSession, q: string): boolean {
  if (!q) return true;
  if (s.title.toLowerCase().includes(q)) return true;
  for (const p of s.participants) {
    if (p.displayName.toLowerCase().includes(q)) return true;
    if (p.codename && p.codename.toLowerCase().includes(q)) return true;
  }
  return false;
}

interface SessionsClientProps {
  initialSessions: SerializedSession[];
  initialYear: number;
  initialMonth: number;
  guildId: string;
  initialUpcoming: UpcomingSessionLink[];
}

export default function SessionsClient({
  initialSessions,
  initialYear,
  initialMonth,
  guildId,
  initialUpcoming,
}: SessionsClientProps) {
  const [tab, setTab] = useState<TabKey>("calendar");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | SessionStatus>(
    "ALL",
  );

  const { data: sessions = [] } = useSessionsByMonth(
    initialYear,
    initialMonth,
    guildId,
    { initialData: initialSessions },
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredList = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (!matchesQuery(s, normalizedQuery)) return false;
      return true;
    });
  }, [sessions, normalizedQuery, statusFilter]);

  const myRsvpUpcoming = useMemo(() => {
    const now = new Date().getTime();
    return sessions
      .filter(
        (s) =>
          s.myRsvp === "YES" &&
          s.status !== "CANCELED" &&
          new Date(s.targetDateTime).getTime() >= now,
      )
      .sort(
        (a, b) =>
          new Date(a.targetDateTime).getTime() -
          new Date(b.targetDateTime).getTime(),
      )
      .slice(0, MY_RSVP_UPCOMING_LIMIT);
  }, [sessions]);

  return (
    <>
      <Box className={styles.searchBox}>
        <div className={styles.searchRow}>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="작전명 · 참여자 codename · 닉네임 검색"
            className={styles.searchInput}
            aria-label="세션 검색"
          />
          <Button size="sm" aria-label="검색" type="button">
            ⌕ 검색
          </Button>
        </div>
      </Box>

      <div className={styles.tabsRow}>
        <div className={styles.tabs} role="tablist">
          {TABS.map(({ key, label }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                className={[styles.tab, active ? styles["tab--active"] : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "ALL" | SessionStatus)
          }
          aria-label="상태 필터"
          className={styles.statusSelect}
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      <div className={styles.cols}>
        <div className={styles.colMain}>
          {tab === "calendar" ? (
            <Box>
              <SessionCalendar
                initialSessions={initialSessions}
                initialYear={initialYear}
                initialMonth={initialMonth}
                guildId={guildId}
              />
            </Box>
          ) : null}

          {tab === "list" ? (
            <Box>
              <PanelTitle
                right={
                  <span className={styles.mono}>{filteredList.length} 건</span>
                }
              >
                SESSION LIST · {initialYear}.
                {String(initialMonth).padStart(2, "0")}
              </PanelTitle>

              {filteredList.length === 0 ? (
                <div className={styles.empty}>해당 조건의 세션이 없습니다.</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>상태</th>
                        <th>작전명</th>
                        <th className={styles.countCol}>참여</th>
                        <th className={styles.dateCol}>일시</th>
                        <th className={styles.linkCol} aria-label="디스코드" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredList.map((s) => {
                        const meta = STATUS_TAG[s.status];
                        const link = buildDiscordLink(s);
                        return (
                          <tr key={s._id}>
                            <td>
                              <Tag tone={meta.tone}>{meta.label}</Tag>
                            </td>
                            <td className={styles.titleCol}>
                              {s.myRsvp === "YES" &&
                              s.status !== "CANCELED" ? (
                                <span
                                  className={styles.attendMark}
                                  aria-label="내 참여"
                                  title="내 참여"
                                >
                                  ★
                                </span>
                              ) : null}
                              {s.title}
                            </td>
                            <td className={`${styles.countCol} ${styles.mono}`}>
                              {s.counts.yes}명
                            </td>
                            <td
                              className={`${styles.dateCol} ${styles.mono}`}
                            >
                              {formatDateTime(s.targetDateTime)}
                            </td>
                            <td className={styles.linkCol}>
                              <Button
                                as="a"
                                size="sm"
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`${s.title} · 디스코드에서 열기`}
                              >
                                ↗ 디스코드
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Box>
          ) : null}
        </div>

        <div className={styles.colSide}>
          <Box>
            <PanelTitle
              right={
                <span className={styles.mono}>{myRsvpUpcoming.length}</span>
              }
            >
              MY RSVP · 다가올
            </PanelTitle>

            {myRsvpUpcoming.length === 0 ? (
              <div className={styles.empty}>예정된 참여 세션 없음</div>
            ) : (
              <ul className={styles.sideList}>
                {myRsvpUpcoming.map((s) => (
                  <li key={s._id} className={styles.sideItem}>
                    <div className={styles.sideItemBody}>
                      <span className={styles.sideItemTitle}>{s.title}</span>
                      <span className={`${styles.sideItemDate} ${styles.mono}`}>
                        {formatDateTime(s.targetDateTime)}
                      </span>
                    </div>
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
                  </li>
                ))}
              </ul>
            )}

            <Eyebrow className={styles.sideEyebrow}>OPEN · 임박</Eyebrow>
            {initialUpcoming.length === 0 ? (
              <div className={styles.empty}>열려있는 세션 없음</div>
            ) : (
              <ul className={styles.sideList}>
                {initialUpcoming.map((s) => (
                  <li key={s._id} className={styles.sideItem}>
                    <div className={styles.sideItemBody}>
                      <span className={styles.sideItemTitle}>{s.title}</span>
                      <span className={`${styles.sideItemDate} ${styles.mono}`}>
                        {formatDateTime(s.targetDateTime)}
                      </span>
                    </div>
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
                  </li>
                ))}
              </ul>
            )}
          </Box>
        </div>
      </div>
    </>
  );
}
