import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreditTransactionType } from "@/types/credit";

import { creditKeys } from "@/hooks/queries/useCreditsQuery";

interface GrantCreditInput {
  userId: string;
  userName: string;
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
