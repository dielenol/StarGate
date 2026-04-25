import { useQuery } from "@tanstack/react-query";

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
  userId: string;
  status: ResponseStatus;
  displayName: string;
  codename?: string;
}

export interface SerializedSession {
  _id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  targetDateTime: string;
  closeDateTime: string;
  targetRoleId: string;
  status: SessionStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** 응답자 목록 (YES/NO 전부) */
  participants: SerializedSessionParticipant[];
  /** 응답 상태별 카운트 */
  counts: { yes: number; no: number };
  /** 현재 로그인 유저의 응답. 미응답/게스트는 null. */
  myRsvp: ResponseStatus | null;
}

export const sessionKeys = {
  all: ["sessions"] as const,
  byMonth: (year: number, month: number, guildId: string) =>
    ["sessions", year, month, guildId] as const,
};

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
  return useQuery({
    queryKey: sessionKeys.byMonth(year, month, guildId),
    queryFn: () => fetchSessionsByMonth(year, month, guildId),
    staleTime: 2 * 60 * 1000,
    initialData: options?.initialData,
  });
}
