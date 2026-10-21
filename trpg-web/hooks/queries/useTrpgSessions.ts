"use client";

import { useQuery } from "@tanstack/react-query";

import type { TrpgSessionView } from "@/lib/trpg/serializer";

export type { TrpgSessionView };

export const trpgSessionKeys = {
  all: ["trpg-sessions"] as const,
  byMonth: (year: number, month: number) =>
    ["trpg-sessions", year, month] as const,
};

export function useTrpgSessions(
  year: number,
  month: number,
  options?: {
    initialData?: TrpgSessionView[];
    /**
     * `initialData` 를 읽은 시각(epoch ms, **기기 시계 기준**). 주지 않으면 TanStack 은 쿼리가 만들어진
     * 시각을 기준으로 잡아, 월을 옮겼다가 gc 뒤에 돌아왔을 때 오래된 prefetch 가 방금 받은 데이터처럼
     * staleTime 동안 신선하게 다시 시드된다. TanStack 은 이 값을 기기 `Date.now()` 와 비교하므로
     * 서버 시각은 그대로 넘기지 말고 기기 시각으로 환산해 넘긴다(CalendarClient 참고).
     */
    initialDataUpdatedAt?: number;
  },
) {
  return useQuery({
    queryKey: trpgSessionKeys.byMonth(year, month),
    queryFn: async (): Promise<TrpgSessionView[]> => {
      // TanStack staleTime 이 진실의 출처 — fetch-level no-store 는 중복.
      const res = await fetch(
        `/api/trpg/sessions?year=${year}&month=${month}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "세션 조회 실패");
      }
      return res.json();
    },
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
  });
}
