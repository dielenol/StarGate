import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { CharacterChangeLogEntry } from "@stargate/shared-db";
import type { UserRole } from "@/types/user";

/**
 * 서버가 반환하는 변경 이력 row.
 *
 * - revertable: GM 시야에서 revertedAt 가 null 이면 true, 그 외 false.
 *   (서버가 이미 가드해서 내려주므로 클라이언트는 그대로 사용 — 권한 변경 시 invalidate)
 * - actorDisplayName / revertedByDisplayName: 서버에서 일괄 user lookup 후 보강.
 *   사용자 삭제 등으로 매핑 실패 시 `user-{6자}` anonymize.
 */
export interface CharacterChangeLogRow {
  _id: string;
  characterId: string;
  actorId: string;
  actorRole: UserRole;
  actorIsOwner: boolean;
  actorDisplayName: string | null;
  actorUsername: string | null;
  source: "admin" | "player";
  changes: CharacterChangeLogEntry[];
  reason: string | null;
  createdAt: string;
  revertedAt: string | null;
  revertedBy: string | null;
  revertedByDisplayName: string | null;
  revertable: boolean;
}

export interface CharacterChangeLogsResponse {
  items: CharacterChangeLogRow[];
  hasMore: boolean;
  limit: number;
  skip: number;
  viewerIsGm: boolean;
}

export const characterChangeLogsKeys = {
  all: ["character-change-logs"] as const,
  byCharacter: (characterId: string, limit: number, skip: number) =>
    ["character-change-logs", characterId, { limit, skip }] as const,
};

async function fetchChangeLogs(
  characterId: string,
  limit: number,
  skip: number,
): Promise<CharacterChangeLogsResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (skip > 0) params.set("skip", String(skip));
  const res = await fetch(
    `/api/erp/characters/${characterId}/change-logs?${params.toString()}`,
  );
  if (!res.ok) throw new Error("변경 이력을 불러올 수 없습니다.");
  return res.json();
}

/**
 * 캐릭터 변경 이력 조회 훅.
 *
 * staleTime 60s — 이력은 audit 누적 데이터라 자주 변하지 않음. 한 페이지 내에서 revert 후
 * 명시적 invalidateQueries 로 즉시 갱신.
 *
 * enabled false 면 fetch 자체 송신 안 함 — 권한 없는 사용자가 패널을 숨길 때 사용.
 *
 * 4xx 는 retry 1 — 권한/존재는 재시도 의미 없음 + 트래픽 노이즈 회피.
 */
export function useCharacterChangeLogs(
  characterId: string,
  enabled: boolean,
  options?: { limit?: number; skip?: number },
) {
  const limit = options?.limit ?? 20;
  const skip = options?.skip ?? 0;
  return useQuery({
    queryKey: characterChangeLogsKeys.byCharacter(characterId, limit, skip),
    queryFn: () => fetchChangeLogs(characterId, limit, skip),
    enabled,
    staleTime: 60 * 1000,
    retry: 1,
    // 페이지 전환 시 직전 페이지 데이터 유지 — 빈 화면 깜빡임 방지.
    placeholderData: keepPreviousData,
  });
}
