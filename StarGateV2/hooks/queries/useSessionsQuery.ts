import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { ResponseStatus, SessionStatus } from "@/types/session";

/**
 * 세션 참여자 엔트리 (응답 기반).
 *
 * - `displayName`: session_responses.displayName (디스코드 표시명, bot이 upsert)
 * - `codename`: 해당 유저의 대표 캐릭터 codename (옵셔널, 없으면 생략)
 *
 * codename 은 서버 enrich 실패(미연결 유저 등) 시 undefined 일 수 있다.
 */
export interface SerializedSessionParticipant {
  status: ResponseStatus;
  displayName: string;
  codename?: string;
  isMe?: boolean;
}

/**
 * 세션 데이터 출처.
 *
 * - `"registra"`: registra-bot 공유 `sessions` 컬렉션 (디스코드 공지/응답 모델).
 * - `"trpg"`: trpg-bot 단독 `trpg_sessions` 컬렉션 (DM 알림 모델, 채널/메시지 없음).
 *
 * UI 분기: source === "trpg" 일 때 디스코드 채널 링크 대신 trpg-web 캘린더로 이동.
 */
export type SessionSource = "registra" | "trpg";

export interface SerializedSession {
  _id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  targetDateTime: string;
  closeDateTime: string;
  status: SessionStatus;
  /** 응답자 목록 (YES/NO 전부) */
  participants: SerializedSessionParticipant[];
  /** 응답 상태별 카운트 */
  counts: { yes: number; no: number };
  /** 현재 로그인 유저의 응답. 미응답/게스트는 null. */
  myRsvp: ResponseStatus | null;
  /** 데이터 출처 — registra(공유) / trpg(별도 봇). UI 분기/링크 동작에 사용. */
  source: SessionSource;
}

export const sessionKeys = {
  all: ["sessions"] as const,
  byMonth: (year: number, month: number, guildId: string) =>
    ["sessions", year, month, guildId] as const,
};

const CURRENT_MONTH_STALE_TIME_MS = 60 * 1000;
const ARCHIVE_MONTH_STALE_TIME_MS = 10 * 60 * 1000;
const CURRENT_MONTH_REFETCH_INTERVAL_MS = 60 * 1000;

async function fetchSessionsByMonth(
  year: number,
  month: number,
  guildId: string,
): Promise<SerializedSession[]> {
  const res = await fetch(
    `/api/erp/sessions?year=${year}&month=${month}&guildId=${encodeURIComponent(guildId)}`,
  );
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "세션 데이터를 불러올 수 없습니다.");
  }
  const data = await res.json();
  return data.sessions;
}

export function useSessionsByMonth(
  year: number,
  month: number,
  guildId: string,
  options?: { initialData?: SerializedSession[] },
) {
  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  return useQuery({
    queryKey: sessionKeys.byMonth(year, month, guildId),
    queryFn: () => fetchSessionsByMonth(year, month, guildId),
    enabled: guildId.length > 0,
    staleTime: isCurrentMonth
      ? CURRENT_MONTH_STALE_TIME_MS
      : ARCHIVE_MONTH_STALE_TIME_MS,
    refetchInterval: isCurrentMonth
      ? CURRENT_MONTH_REFETCH_INTERVAL_MS
      : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: isCurrentMonth,
    initialData: options?.initialData,
    placeholderData: keepPreviousData,
  });
}
