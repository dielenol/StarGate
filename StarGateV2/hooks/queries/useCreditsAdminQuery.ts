import { useQuery } from "@tanstack/react-query";

import type {
  AgentBalanceRow,
  CreditKpiSnapshot,
  CreditTransactionFilter,
  CreditTransactionPage,
  SessionRewardCandidate,
} from "@/types/credit-admin";

/* ── Query Key 팩토리 ── */

export const creditsAdminKeys = {
  all: ["credits-admin"] as const,
  kpi: () => [...creditsAdminKeys.all, "kpi"] as const,
  balances: () => [...creditsAdminKeys.all, "balances"] as const,
  log: (filter: CreditTransactionFilter) =>
    [...creditsAdminKeys.all, "log", filter] as const,
  opPool: () => [...creditsAdminKeys.all, "op-pool"] as const,
  sessionCandidates: (daysBack: number) =>
    [...creditsAdminKeys.all, "sessions", daysBack] as const,
};

/* ── 에러 ── */

export class CreditsAdminApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CreditsAdminApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  throw new CreditsAdminApiError(body.error ?? fallback, res.status, body.code);
}

/* ── 응답 타입 ── */

/**
 * 클라이언트로 직렬화된 OP 풀 DTO.
 * shared-db `CreditPool` 의 Date 필드를 ISO string 으로, _id 를 hex 로 변환.
 * (서버 라우트는 항상 본 DTO 형태로 응답 — 타입과 런타임 형태 일치.)
 */
export interface OpPoolDto {
  _id: string;
  poolId: string;
  name: string;
  balance: number;
  updatedAt: string;
  createdAt: string;
}

export interface OpPoolResponse {
  pool: OpPoolDto | null;
  exists: boolean;
}

export interface SessionCandidatesResponse {
  candidates: SessionRewardCandidate[];
}

export interface BalancesResponse {
  rows: AgentBalanceRow[];
  generatedAt: string;
}

/* ── 쿼리스트링 빌더 ── */

function buildLogQuery(filter: CreditTransactionFilter): string {
  const params = new URLSearchParams();
  if (filter.types?.length) params.set("types", filter.types.join(","));
  if (filter.ownerId) params.set("ownerId", filter.ownerId);
  if (filter.characterId) params.set("characterId", filter.characterId);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.amountMin !== undefined)
    params.set("amountMin", String(filter.amountMin));
  if (filter.amountMax !== undefined)
    params.set("amountMax", String(filter.amountMax));
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  if (filter.skip !== undefined) params.set("skip", String(filter.skip));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/* ── fetcher ── */

async function fetchKpi(): Promise<CreditKpiSnapshot> {
  const res = await fetch("/api/erp/admin/credits/kpi");
  if (!res.ok) await parseError(res, "KPI 조회 실패");
  return res.json();
}

async function fetchBalances(): Promise<BalancesResponse> {
  const res = await fetch("/api/erp/admin/credits/balances");
  if (!res.ok) await parseError(res, "잔액 보드 조회 실패");
  return res.json();
}

async function fetchLog(
  filter: CreditTransactionFilter,
): Promise<CreditTransactionPage> {
  const res = await fetch(
    `/api/erp/admin/credits/log${buildLogQuery(filter)}`,
  );
  if (!res.ok) await parseError(res, "트랜잭션 조회 실패");
  return res.json();
}

async function fetchOpPool(): Promise<OpPoolResponse> {
  const res = await fetch("/api/erp/admin/credits/op-pool");
  if (!res.ok) await parseError(res, "작전풀 조회 실패");
  return res.json();
}

async function fetchSessionCandidates(
  daysBack: number,
): Promise<SessionCandidatesResponse> {
  const res = await fetch(`/api/erp/admin/credits/sessions?daysBack=${daysBack}`);
  if (!res.ok) await parseError(res, "세션 후보 조회 실패");
  return res.json();
}

/* ── hooks ── */

/** GM 운영 KPI 스냅샷. 30s staleTime — 운영 페이지 진입 즉시 표시. */
export function useCreditKpi(opt?: { initialData?: CreditKpiSnapshot }) {
  return useQuery({
    queryKey: creditsAdminKeys.kpi(),
    queryFn: fetchKpi,
    staleTime: 30_000,
    initialData: opt?.initialData,
  });
}

/** 모든 MAIN AGENT 잔액 보드. 60s — 발급 mutation 시 invalidate. */
export function useCreditBalances(opt?: { initialData?: BalancesResponse }) {
  return useQuery({
    queryKey: creditsAdminKeys.balances(),
    queryFn: fetchBalances,
    staleTime: 60_000,
    initialData: opt?.initialData,
  });
}

/** 필터 변경 시 자동 refetch. placeholderData 로 transition 부드럽게. */
export function useCreditLog(
  filter: CreditTransactionFilter,
  opt?: { initialData?: CreditTransactionPage },
) {
  return useQuery({
    queryKey: creditsAdminKeys.log(filter),
    queryFn: () => fetchLog(filter),
    staleTime: 0,
    initialData: opt?.initialData,
    placeholderData: (prev) => prev,
  });
}

/** OP 풀 상태. 30s — POST 후 invalidate 로 갱신. */
export function useCreditOpPool(opt?: { initialData?: OpPoolResponse }) {
  return useQuery({
    queryKey: creditsAdminKeys.opPool(),
    queryFn: fetchOpPool,
    staleTime: 30_000,
    initialData: opt?.initialData,
  });
}

/** 세션 자동 보상 후보 — daysBack 만큼 과거 응답 세션 + 자격 분류. */
export function useCreditSessionCandidates(
  daysBack: number,
  opt?: { initialData?: SessionCandidatesResponse },
) {
  return useQuery({
    queryKey: creditsAdminKeys.sessionCandidates(daysBack),
    queryFn: () => fetchSessionCandidates(daysBack),
    staleTime: 30_000,
    initialData: opt?.initialData,
  });
}
