import { useQuery } from "@tanstack/react-query";

import type { SessionStatus } from "@/types/session";

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
