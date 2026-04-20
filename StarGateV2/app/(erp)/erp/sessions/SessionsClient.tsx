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
import Spread from "@/components/ui/Spread/Spread";
import Stack from "@/components/ui/Stack/Stack";
import Tag from "@/components/ui/Tag/Tag";

import SessionCalendar from "./SessionCalendar";

import styles from "./page.module.css";

type TabKey = "calendar" | "list" | "series" | "report";

interface TabDef {
  key: TabKey;
  label: string;
}

const TABS: TabDef[] = [
  { key: "calendar", label: "달력" },
  { key: "list", label: "리스트" },
  { key: "series", label: "시리즈 / 챕터" },
  { key: "report", label: "리포트" },
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

const STATUS_FILTER_OPTIONS: Array<{ value: "ALL" | SessionStatus; label: string }> = [
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

interface SessionsClientProps {
  initialSessions: SerializedSession[];
  initialYear: number;
  initialMonth: number;
  guildId: string;
}

export default function SessionsClient({
  initialSessions,
  initialYear,
  initialMonth,
  guildId,
}: SessionsClientProps) {
  const [tab, setTab] = useState<TabKey>("calendar");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | SessionStatus>("ALL");

  // 캘린더가 표시하는 달의 데이터만 리스트/필터에서 사용한다.
  // (다른 달로 네비게이트하면 SessionCalendar 내부 상태가 갱신되지만
  //  여기서는 initialMonth 기준 데이터만 보여주므로 UX를 단순하게 유지)
  const { data: sessions = [] } = useSessionsByMonth(
    initialYear,
    initialMonth,
    guildId,
    { initialData: initialSessions },
  );

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (q && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sessions, query, statusFilter]);

  return (
    <>
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
                SESSION LIST · {initialYear}.{String(initialMonth).padStart(2, "0")}
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
                        <th className={styles.dateCol}>일시</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredList.map((s) => {
                        const meta = STATUS_TAG[s.status];
                        return (
                          <tr key={s._id}>
                            <td>
                              <Tag tone={meta.tone}>{meta.label}</Tag>
                            </td>
                            <td className={styles.titleCol}>{s.title}</td>
                            <td className={`${styles.dateCol} ${styles.mono}`}>
                              {formatDateTime(s.targetDateTime)}
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

          {tab === "series" ? (
            <Box>
              <PanelTitle right={<span className={styles.mono}>WIP</span>}>
                SERIES · CHAPTERS
              </PanelTitle>
              <div className={styles.empty}>
                시리즈/챕터 기능은 준비 중입니다.
              </div>
            </Box>
          ) : null}

          {tab === "report" ? (
            <Box>
              <PanelTitle
                right={
                  <Button as="a" href="/erp/sessions/report" size="sm">
                    리포트 목록 →
                  </Button>
                }
              >
                SESSION REPORTS
              </PanelTitle>
              <div className={styles.empty}>
                세션 리포트는 별도 페이지에서 관리합니다.
              </div>
            </Box>
          ) : null}
        </div>

        <div className={styles.colSide}>
          <Box>
            <PanelTitle>FILTERS</PanelTitle>
            <Stack gap={8}>
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="작전명 검색"
                aria-label="세션 제목 검색"
              />
              <Select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "ALL" | SessionStatus)
                }
                aria-label="상태 필터"
              >
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Stack>

            <Eyebrow className={styles.sideEyebrow}>내 RSVP · 0</Eyebrow>
            <div className={styles.empty}>
              RSVP 연동은 준비 중입니다.
            </div>

            <Eyebrow className={styles.sideEyebrow}>DISCORD BOT</Eyebrow>
            <div className={styles.botNote}>
              registrar_bot · 세션 생성/알림 연동
            </div>
            <Stack gap={6} className={styles.botActions}>
              <Spread>
                <span className={styles.mono}>/session</span>
                <Tag>명령</Tag>
              </Spread>
            </Stack>
          </Box>
        </div>
      </div>
    </>
  );
}
