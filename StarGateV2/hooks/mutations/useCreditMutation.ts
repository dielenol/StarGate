import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreditTransactionType } from "@/types/credit";
import type { BulkGrantInput, BulkGrantResult } from "@/types/credit-admin";

import { creditsAdminKeys } from "@/hooks/queries/useCreditsAdminQuery";
import { creditKeys } from "@/hooks/queries/useCreditsQuery";
import { characterKeys, personnelKeys } from "@/hooks/queries/useCharactersQuery";

/**
 * GM 발급 입력. ownerId 또는 characterId 중 하나가 필수 (백엔드 검증).
 *
 * - ownerId 만 보내면: 백엔드가 메인 AGENT 캐릭터로 자동 라우팅
 * - characterId 만 보내면: 해당 캐릭터에 직접 발급 (1인 1 MAIN 정책상 메인 캐릭만 허용)
 *
 * 둘 다 보낼 경우 백엔드가 characterId 우선 적용 — 명시적 지정이 우선.
 */
interface GrantCreditInput {
  ownerId?: string;
  characterId?: string;
  amount: number;
  type: CreditTransactionType;
  description?: string;
}

export function useGrantCredit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: GrantCreditInput) => {
      const res = await fetch("/api/erp/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "크레딧 지급에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
      // GM admin 페이지의 KPI / 잔액 / 로그 모두 갱신.
      queryClient.invalidateQueries({ queryKey: creditsAdminKeys.all });
    },
  });
}

/**
 * GM 일괄 발급 — `POST /api/erp/admin/credits/bulk`.
 *
 * 부분 실패 허용. 응답 `BulkGrantResult.results` 의 각 항목이 success/skipped/error
 * 코드를 가지므로 호출 측은 단순 throw 가 아닌 results 배열을 사용해 결과 테이블 렌더.
 *
 * 네트워크/입력 검증 실패(401/403/400/500) 만 throw — UI 가 폼 에러로 표시.
 */
export function useBulkGrantCredit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: BulkGrantInput): Promise<BulkGrantResult> => {
      const res = await fetch("/api/erp/admin/credits/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "일괄 발급에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
      queryClient.invalidateQueries({ queryKey: creditsAdminKeys.all });
      queryClient.invalidateQueries({ queryKey: characterKeys.all });
      queryClient.invalidateQueries({ queryKey: personnelKeys.all });
    },
  });
}
