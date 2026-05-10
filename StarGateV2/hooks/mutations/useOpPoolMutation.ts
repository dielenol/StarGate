import { useMutation, useQueryClient } from "@tanstack/react-query";

import { creditsAdminKeys } from "@/hooks/queries/useCreditsAdminQuery";

/**
 * 작전 크레딧 풀 (OP POOL) 운영 mutation.
 *
 * D2 결정 — 풀 잔액만 atomic 가산. ledger 트랜잭션 미생성 (봇과 일치).
 *
 * action="init"   — 풀 부재 시 OPERATION_POOL_INITIAL_BALANCE 로 부트스트랩.
 *                   이미 존재하면 서버 409 + code "POOL_EXISTS".
 * action="adjust" — amount(0 아닌 number, 음수 = 감액) 가산. 풀 부재 → "POOL_NOT_FOUND".
 *                   감액 시 잔액 부족 + allowNegative=false → "POOL_INSUFFICIENT".
 *
 * description 은 받기만 하고 현 단계 서버에서 미보존(향후 op_pool_audits 컬렉션 도입 대비).
 *
 * onSuccess: opPool / kpi 캐시 무효화 (KPI 카드의 OP 풀 잔액 동기화).
 */

interface OpPoolInitInput {
  action: "init";
}

interface OpPoolAdjustInput {
  action: "adjust";
  amount: number;
  allowNegative?: boolean;
  description?: string;
}

type OpPoolInput = OpPoolInitInput | OpPoolAdjustInput;

/** mutation 에러 — code/status 첨부해 호출 측이 분기 가능 */
export class OpPoolMutationError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "OpPoolMutationError";
    this.status = status;
    this.code = code;
  }
}

export function useOpPoolMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: OpPoolInput) => {
      const res = await fetch("/api/erp/admin/credits/op-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        throw new OpPoolMutationError(
          data.error ?? "작전풀 처리에 실패했습니다.",
          res.status,
          data.code,
        );
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creditsAdminKeys.opPool() });
      // KPI 카드의 OP 풀 잔액도 동기화.
      queryClient.invalidateQueries({ queryKey: creditsAdminKeys.kpi() });
    },
  });
}
