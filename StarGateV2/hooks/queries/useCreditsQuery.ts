import { useQuery } from "@tanstack/react-query";

import type { CreditTransaction } from "@/types/credit";

export const creditKeys = {
  all: ["credits"] as const,
};

/**
 * GET /api/erp/credits 응답 (성공 케이스).
 *
 * Phase 2: character 단위 ledger 전환.
 * - 본인 조회 시 메인 캐릭 미등록이면 404 + `code=NO_MAIN_CHARACTER` 응답
 *   (V+ ownerId 조회와 일관). useQuery error 분기에서 처리한다.
 * - 1인 1 MAIN 위반은 409 + `code=MAIN_CHARACTER_INTEGRITY`.
 * - GM 이 query (?characterId / ?ownerId) 로 대상 명시 가능.
 */
export interface CreditsResponse {
  transactions: CreditTransaction[];
  balance: number;
  characterId: string;
  characterCodename: string;
}

/** 서버가 반환하는 에러 응답 — error 객체에 attach 해 클라이언트에서 분기 가능. */
export type CreditsErrorCode =
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY"
  | "INSUFFICIENT_BALANCE";

export class CreditsApiError extends Error {
  readonly status: number;
  readonly code?: CreditsErrorCode;
  constructor(message: string, status: number, code?: CreditsErrorCode) {
    super(message);
    this.name = "CreditsApiError";
    this.status = status;
    this.code = code;
  }
}

async function fetchCredits(): Promise<CreditsResponse> {
  const res = await fetch("/api/erp/credits");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: CreditsErrorCode;
    };
    throw new CreditsApiError(
      body.error ?? "크레딧 데이터를 불러올 수 없습니다.",
      res.status,
      body.code,
    );
  }
  return res.json();
}

export function useCredits(options?: { initialData?: CreditsResponse }) {
  return useQuery({
    queryKey: creditKeys.all,
    queryFn: fetchCredits,
    staleTime: 5 * 60 * 1000,
    initialData: options?.initialData,
    // 메인 캐릭 미등록 / 정합성 위반은 사용자 인풋으로는 자동 회복 불가 → 재시도 비활성.
    retry: (failureCount, err) => {
      if (err instanceof CreditsApiError && (err.status === 404 || err.status === 409)) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
