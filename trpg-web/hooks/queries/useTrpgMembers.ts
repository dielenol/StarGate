"use client";

import { useQuery } from "@tanstack/react-query";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";

export type { TrpgMemberView };

export const trpgMemberKeys = {
  all: ["trpg-members"] as const,
};

export function useTrpgMembers(options?: { initialData?: TrpgMemberView[] }) {
  return useQuery({
    queryKey: trpgMemberKeys.all,
    queryFn: async (): Promise<TrpgMemberView[]> => {
      // TanStack staleTime 이 진실의 출처 — fetch-level no-store 는 중복.
      const res = await fetch("/api/trpg/members");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "멤버 조회 실패");
      }
      return res.json();
    },
    initialData: options?.initialData,
  });
}
