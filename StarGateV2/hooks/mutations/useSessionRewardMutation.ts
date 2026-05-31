import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { BulkGrantResult, RewardKind } from "@/types/credit-admin";

import { creditKeys } from "@/hooks/queries/useCreditsQuery";
import { creditsAdminKeys } from "@/hooks/queries/useCreditsAdminQuery";
import { characterKeys, personnelKeys } from "@/hooks/queries/useCharactersQuery";

/**
 * GM 세션 자동 보상 발급 — `POST /api/erp/admin/credits/sessions`.
 *
 * 부분 실패/스킵 허용. 응답 `BulkGrantResult.results` 의 각 항목이
 * success/skipped/error 코드를 가지므로 호출 측은 단순 throw 가 아닌 results 배열을
 * 사용해 결과 테이블 렌더.
 *
 * 네트워크/입력 검증 실패(401/403/400/404/500) 만 throw — UI 가 인라인 에러로 표시.
 * onSuccess 시 세션 후보 캐시(daysBack 별) 도 함께 invalidate 되어
 * already-rewarded 카운트 즉시 갱신.
 */
interface SessionRewardInput {
  sessionId: string;
  amount: number;
  rewardKind?: RewardKind;
  description?: string;
}

export function useSessionRewardMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SessionRewardInput): Promise<BulkGrantResult> => {
      const res = await fetch("/api/erp/admin/credits/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "세션 자동 보상에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      // 사용자 본인 크레딧 캐시 + admin 전체 (KPI/잔액/로그/세션후보) 모두 갱신.
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
      queryClient.invalidateQueries({ queryKey: creditsAdminKeys.all });
      queryClient.invalidateQueries({ queryKey: characterKeys.all });
      queryClient.invalidateQueries({ queryKey: personnelKeys.all });
    },
  });
}
