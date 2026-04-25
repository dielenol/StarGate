import { useQuery } from "@tanstack/react-query";

/**
 * 서버가 반환하는 쿨다운 응답 형식. resetAt 은 ISO 문자열이라 UI에서 Date 로 변환 필요.
 *
 * - admin: 쿨다운 미적용. 폼에서 표시 생략.
 * - player: used/remaining/resetAt 표시 대상.
 */
export type CharacterEditQuota =
  | { mode: "admin"; allowed: true }
  | {
      mode: "player";
      allowed: boolean;
      used: number;
      remaining: number;
      resetAt: string;
      windowHours: number;
      maxCount: number;
    };

export const characterEditQuotaKeys = {
  all: ["character-edit-quota"] as const,
  byCharacter: (characterId: string) =>
    ["character-edit-quota", characterId] as const,
};

async function fetchCharacterEditQuota(
  characterId: string,
): Promise<CharacterEditQuota> {
  const res = await fetch(`/api/erp/characters/${characterId}/edit-quota`);
  if (!res.ok) throw new Error("편집 쿼터를 불러올 수 없습니다.");
  return res.json();
}

/**
 * 캐릭터 편집 쿼터 조회 훅. enabled 가 false 면 fetch 자체를 보내지 않는다 —
 * admin 모드에서 굳이 폴링하지 않으려는 호출자(CharacterEditForm)가 사용.
 *
 * staleTime 30s — 쿨다운 used 카운트는 사용자가 저장 직후 다시 폼을 열 때
 * 거의 실시간 갱신이 필요해 짧게 잡음. 폼 진입 시 초회 fetch + invalidate 로 충분.
 */
export function useCharacterEditQuota(characterId: string, enabled: boolean) {
  return useQuery({
    queryKey: characterEditQuotaKeys.byCharacter(characterId),
    queryFn: () => fetchCharacterEditQuota(characterId),
    enabled,
    staleTime: 30 * 1000,
    // 4xx (권한/존재) 는 재시도해도 결과 동일 — 트래픽/로그 노이즈 회피.
    retry: 1,
  });
}
