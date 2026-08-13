import { useQuery } from "@tanstack/react-query";

import type { CreditTransaction } from "@/types/credit";

export const creditKeys = {
  all: ["credits"] as const,
  full: ["credits", "full"] as const,
  balance: (characterId: string) =>
    ["credits", "balance", characterId] as const,
};

export interface CreditBalanceResponse {
  balance: number;
  characterId: string | null;
  hasMainCharacter: boolean;
}

function isExpectedCreditCharacter(
  data: CreditBalanceResponse | undefined,
  characterId: string | null,
): data is CreditBalanceResponse {
  return (
    characterId !== null &&
    data?.hasMainCharacter === true &&
    data.characterId === characterId
  );
}

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

async function fetchCreditBalance(
  expectedCharacterId: string,
): Promise<CreditBalanceResponse> {
  const res = await fetch("/api/erp/credits/balance", { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: CreditsErrorCode;
    };
    throw new CreditsApiError(
      body.error ?? "크레딧 잔액을 불러올 수 없습니다.",
      res.status,
      body.code,
    );
  }
  const data = (await res.json()) as CreditBalanceResponse;
  if (!data.hasMainCharacter || data.characterId !== expectedCharacterId) {
    throw new CreditsApiError(
      "메인 캐릭터 정보가 변경되었습니다. 페이지를 새로고침해 주세요.",
      409,
    );
  }
  return data;
}

export function useCredits(options?: {
  enabled?: boolean;
  initialData?: CreditsResponse;
}) {
  return useQuery({
    queryKey: creditKeys.full,
    queryFn: fetchCredits,
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled,
    initialData: options?.initialData,
    refetchOnWindowFocus: true,
    // 메인 캐릭 미등록 / 정합성 위반은 사용자 인풋으로는 자동 회복 불가 → 재시도 비활성.
    retry: (failureCount, err) => {
      if (err instanceof CreditsApiError && (err.status === 404 || err.status === 409)) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

export function useCreditBalance(
  characterId: string | null,
  options?: { initialData?: CreditBalanceResponse },
) {
  const initialData = isExpectedCreditCharacter(
    options?.initialData,
    characterId,
  )
    ? options.initialData
    : undefined;
  return useQuery({
    queryKey: creditKeys.balance(characterId ?? "missing"),
    queryFn: () => fetchCreditBalance(characterId!),
    staleTime: 5 * 60 * 1000,
    enabled: characterId !== null,
    initialData,
    refetchOnWindowFocus: true,
    retry: (failureCount, err) => {
      if (
        err instanceof CreditsApiError &&
        (err.status === 404 || err.status === 409)
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
