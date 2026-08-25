import type {
  HonorRecord,
  OperationHonorCategory,
} from "@stargate/shared-db";

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
  generatedAt: string;
  selectedSeason: {
    key: string;
    label: string;
    finalizedAt: string;
  } | null;
  seasons: Array<{ key: string; label: string }>;
  items: HallOfFameHonorItem[];
}

export interface HallOfFameCitationPageResponse {
  generatedAt: string;
  items: HallOfFameHonorItem[];
  nextCursor?: string;
}

export interface HallOfFameMineResponse {
  total: number;
  ribbons: HallOfFameHonorItem[];
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
