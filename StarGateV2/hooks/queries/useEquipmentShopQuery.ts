/**
 * 병기부 카탈로그 query hook.
 *
 * - `useEquipmentShopCatalog`: GET /api/erp/equipment-shop/catalog
 * - 카탈로그 대상은 master_items 의 WEAPON/ARMOR + 전략 태그가 붙은 SPECIAL 항목.
 */

import { useQuery } from "@tanstack/react-query";

import type { EquipmentShopCatalogItem } from "@/lib/equipment-shop/catalog";
import type {
  EquipmentResearchCapabilities,
  EquipmentResearchNode,
  EquipmentResearchRushRule,
  EquipmentResearchStatus,
  EquipmentResearchStat,
  EquipmentResearchScope,
} from "@/lib/equipment-shop/research";
import type {
  SerializedEquipmentResearchContribution,
  SerializedEquipmentResearchContributionRanking,
  SerializedEquipmentResearchProject,
  SerializedEquipmentResearchTeamFundingPool,
} from "@/lib/db/equipment-research";

export const equipmentShopKeys = {
  all: ["equipment-shop"] as const,
  catalog: ["equipment-shop", "catalog"] as const,
  research: ["equipment-shop", "research"] as const,
};

export type EquipmentShopErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY"
  | "NO_AGENT_TARGETS"
  | "INVENTORY_FAILED_REFUNDED"
  | "REFUND_FAILED"
  | "INVALID_CART"
  | "INVALID_RESEARCH"
  | "ITEM_NOT_AVAILABLE"
  | "PRICE_NOT_SET"
  | "RESEARCH_CAP_REACHED"
  | "RESEARCH_PREREQUISITE_MISSING"
  | "RESEARCH_NOT_READY"
  | "RUSH_LIMIT_REACHED"
  | "TEAM_RESEARCH_REQUIRES_CONTRIBUTION"
  | "RESEARCH_ALREADY_STARTED"
  | "RESEARCH_FUNDING_CONFLICT"
  | "RESEARCH_START_FAILED"
  | "FORBIDDEN_RESEARCH_PROJECT";

export class EquipmentShopApiError extends Error {
  readonly status: number;
  readonly code?: EquipmentShopErrorCode;

  constructor(message: string, status: number, code?: EquipmentShopErrorCode) {
    super(message);
    this.name = "EquipmentShopApiError";
    this.status = status;
    this.code = code;
  }
}

export type EquipmentShopCatalogEntry = EquipmentShopCatalogItem;

export interface EquipmentShopCatalogResponse {
  items: EquipmentShopCatalogEntry[];
  isOpen: boolean;
  mode: "auto" | "open" | "closed";
  scheduledOpen: boolean;
  forceOpen: boolean;
  forceClosed: boolean;
}

export interface EquipmentResearchProjectEntry
  extends SerializedEquipmentResearchProject {
  computedStatus: EquipmentResearchStatus | "completed";
}

export interface EquipmentResearchOverviewResponse {
  tree: EquipmentResearchNode[];
  rushRules: EquipmentResearchRushRule[];
  caps: Record<EquipmentResearchStat | "points", number>;
  capabilities: EquipmentResearchCapabilities;
  projects: EquipmentResearchProjectEntry[];
  fundingPools: SerializedEquipmentResearchTeamFundingPool[];
  recentContributions: SerializedEquipmentResearchContribution[];
  contributionRankings: SerializedEquipmentResearchContributionRanking[];
}

async function parseEquipmentShopError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: EquipmentShopErrorCode;
  };
  throw new EquipmentShopApiError(
    body.error ?? "병기부 API 호출에 실패했습니다.",
    res.status,
    body.code,
  );
}

async function fetchEquipmentShopCatalog(): Promise<EquipmentShopCatalogResponse> {
  const res = await fetch("/api/erp/equipment-shop/catalog", {
    cache: "no-store",
  });
  if (!res.ok) await parseEquipmentShopError(res);
  return res.json();
}

async function fetchEquipmentResearch(): Promise<EquipmentResearchOverviewResponse> {
  const res = await fetch("/api/erp/equipment-shop/research", {
    cache: "no-store",
  });
  if (!res.ok) await parseEquipmentShopError(res);
  return res.json();
}

const CATALOG_STALE_TIME_MS = 10 * 60 * 1000;
const RESEARCH_STALE_TIME_MS = 30 * 1000;

export function useEquipmentShopCatalog(options?: {
  initialData?: EquipmentShopCatalogResponse;
}) {
  return useQuery({
    queryKey: equipmentShopKeys.catalog,
    queryFn: fetchEquipmentShopCatalog,
    staleTime: CATALOG_STALE_TIME_MS,
    initialData: options?.initialData,
  });
}

export function useEquipmentResearch(options?: {
  initialData?: EquipmentResearchOverviewResponse;
}) {
  return useQuery({
    queryKey: equipmentShopKeys.research,
    queryFn: fetchEquipmentResearch,
    staleTime: RESEARCH_STALE_TIME_MS,
    initialData: options?.initialData,
    refetchInterval: 60 * 1000,
  });
}

export type { EquipmentResearchScope };
