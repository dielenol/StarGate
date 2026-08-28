import type {
  HonorRecord,
  OperationHonorCategory,
  RoleLevel,
} from "@stargate/shared-db";

import { roundStockValue } from "./stock-pricing.js";

export type { OperationHonorCategory } from "@stargate/shared-db";

export type HallOfFameDomain = "NOVEX" | "OPERATION";

export interface HallOfFameHonorItem {
  key: string;
  domain: HallOfFameDomain;
  category: OperationHonorCategory | "NOVEX_PODIUM";
  codename: string;
  title: string;
  citation: string;
  rank?: 1 | 2 | 3;
  occurredAt: string;
  sourceLabel: string;
  sourceHref?: string;
}

export interface HallOfFameNovexResponse {
  period: "ALL_TIME";
  basis: "TOTAL_REALIZED_RETURN";
  generatedAt: string;
  items: HallOfFameNovexItem[];
}

export interface HallOfFameNovexItem {
  rank: 1 | 2 | 3;
  codename: string;
  totalRealizedReturn: number;
  profitEventCount: number;
}

export interface NovexLifetimeReturnCandidate {
  characterId: string;
  codename: string;
  totalRealizedReturn: number;
  profitEventCount: number;
}

export interface HallOfFameOverviewResponse {
  generatedAt: string;
  totalRecords: number;
  novexHonoreeCount: number;
}

export interface HallOfFameCitationPageResponse {
  generatedAt: string;
  items: HallOfFameHonorItem[];
  nextCursor?: string;
}

export type HallOfFameReportReviewState = "PENDING" | null;

export interface HallOfFameReportReviewResponse {
  generatedAt: string;
  state: HallOfFameReportReviewState;
}

export interface HallOfFameMineResponse {
  total: number;
  ribbons: HallOfFameHonorItem[];
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** GM 및 `*TEST` 계정은 운영 공적 집계에서 제외한다. */
export function isNovexHallExcludedAccount(input: {
  username: string;
  role: RoleLevel;
}): boolean {
  return (
    input.role === "GM" ||
    input.username.trim().toUpperCase().endsWith("TEST")
  );
}

/** 전 기간 실현손익 내림차순 TOP 3. 공개 결과에는 계정·캐릭터 식별자를 싣지 않는다. */
export function rankNovexLifetimeReturnCandidates(
  candidates: readonly NovexLifetimeReturnCandidate[],
): HallOfFameNovexItem[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.characterId.trim().length > 0 &&
        candidate.codename.trim().length > 0 &&
        Number.isFinite(candidate.totalRealizedReturn) &&
        Number.isInteger(candidate.profitEventCount) &&
        candidate.profitEventCount > 0,
    )
    .map((candidate) => ({
      ...candidate,
      totalRealizedReturn: roundStockValue(candidate.totalRealizedReturn),
    }))
    .sort(
      (left, right) =>
        right.totalRealizedReturn - left.totalRealizedReturn ||
        compareStableText(left.codename, right.codename) ||
        compareStableText(left.characterId, right.characterId),
    )
    .slice(0, 3)
    .map((candidate, index) => ({
      rank: (index + 1) as 1 | 2 | 3,
      codename: candidate.codename,
      totalRealizedReturn: candidate.totalRealizedReturn,
      profitEventCount: candidate.profitEventCount,
    }));
}

/** 내부 ID·분석 감사 필드를 반환할 수 없도록 명시적으로 public shape를 만든다. */
export function toHallOfFameHonorItem(
  record: HonorRecord,
  options: { includeSourceHref?: boolean } = {},
): HallOfFameHonorItem {
  return {
    key: record.publicKey,
    domain: record.domain,
    category: record.category,
    codename: record.codenameSnapshot,
    title: record.title,
    citation: record.citation,
    ...(record.rank ? { rank: record.rank } : {}),
    occurredAt: record.occurredAt.toISOString(),
    sourceLabel: record.source.label,
    ...(options.includeSourceHref && record.source.href
      ? { sourceHref: record.source.href }
      : {}),
  };
}
