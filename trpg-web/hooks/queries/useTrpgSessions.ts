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
  options?: { initialData?: TrpgSessionView[] },
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
  });
}
