/**
 * 병기부 카탈로그 query hook.
 *
 * - `useEquipmentShopCatalog`: GET /api/erp/equipment-shop/catalog
 * - 카탈로그 대상은 master_items 의 병기부 장비, 토와스키 소모품,
 *   전략 태그가 붙은 SPECIAL 항목.
 */

import { useQuery } from "@tanstack/react-query";

import type { EquipmentShopCatalogItem } from "@/lib/equipment-shop/catalog";
import type { EquipmentShopActivityEntry } from "@/lib/equipment-shop/activity";
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
  catalogScope: (
    scope: EquipmentShopCatalogScope,
    characterId: string | null,
  ) => ["equipment-shop", "catalog", scope, characterId ?? "unassigned"] as const,
  research: ["equipment-shop", "research"] as const,
};

export type EquipmentShopCatalogScope = "all" | "towaski";

export type EquipmentShopErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY"
  | "NO_AGENT_TARGETS"
  | "INVENTORY_FAILED_REFUNDED"
  | "REFUND_FAILED"
  | "INVALID_CART"
  | "LICENSE_REQUIRED"
  | "LICENSE_ALREADY_OWNED"
  | "INVALID_LICENSE_TEST"
  | "LICENSE_TEST_FAILED"
  | "LICENSE_TEST_EXPIRED"
  | "LICENSE_TEST_STALE_ROUND"
  | "LICENSE_TEST_TOO_FAST"
  | "LICENSE_TEST_CONFLICT"
  | "LICENSE_ITEM_MISSING"
  | "LICENSE_GRANT_FAILED"
  | "INVALID_IDEMPOTENCY_KEY"
  | "DUPLICATE_REQUEST"
  | "CHECKOUT_TRANSACTION_FAILED"
  | "BASIC_LICENSE_REQUIRED"
  | "FORBIDDEN_EQUIPMENT_ZONE"
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
  recentActivity: EquipmentShopActivityEntry[];
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

async function fetchEquipmentShopCatalog(
  scope: EquipmentShopCatalogScope,
): Promise<EquipmentShopCatalogResponse> {
  const query = scope === "towaski" ? "?scope=towaski" : "";
  const res = await fetch(`/api/erp/equipment-shop/catalog${query}`, {
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
  scope?: EquipmentShopCatalogScope;
  characterId?: string | null;
}) {
  const scope = options?.scope ?? "all";
  const characterId = options?.characterId ?? null;
  return useQuery({
    queryKey: equipmentShopKeys.catalogScope(scope, characterId),
    queryFn: () => fetchEquipmentShopCatalog(scope),
    staleTime: CATALOG_STALE_TIME_MS,
    initialData: options?.initialData,
  });
}

export function useEquipmentResearch(options?: {
  initialData?: EquipmentResearchOverviewResponse;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: equipmentShopKeys.research,
    queryFn: fetchEquipmentResearch,
    staleTime: RESEARCH_STALE_TIME_MS,
    initialData: options?.initialData,
    enabled: options?.enabled,
    refetchInterval: 60 * 1000,
  });
}

export type { EquipmentResearchScope };
