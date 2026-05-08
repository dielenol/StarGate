import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreditTransactionType } from "@/types/credit";

import { creditKeys } from "@/hooks/queries/useCreditsQuery";

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
    },
  });
}
