/**
 * 편의점 카탈로그 / 보유 인벤토리 query hooks.
 *
 * - `useShopCatalog`: GET /api/erp/shop/catalog — 전체 품목 + 일자별 재고 + 영업 여부.
 * - `useShopInventory`: GET /api/erp/shop/inventory — 본인 메인 캐릭의 보유 편의점 아이템.
 * - `useShopPayback`: GET /api/erp/shop/payback — 미스터비스트 소다 사죄 보상 상태.
 *
 * 에러 분기 — `ShopApiError.code` 로 클라이언트가 분기 가능 (creditKeys 와 동일 패턴).
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNextShopScheduleBoundary } from "@stargate/core/domain/shop-catalog";

import type { RuntimeShopCatalogItem } from "@/lib/shop/runtime-catalog";
import type {
  MrBeastLotteryPendingClaimDto,
  MrBeastLotteryWinnerDto,
} from "@/lib/db/mrbeast-lottery";

/* ── Query keys ── */

export const shopKeys = {
  all: ["shop"] as const,
  catalog: ["shop", "catalog"] as const,
  inventory: ["shop", "inventory"] as const,
  lottery: ["shop", "lottery"] as const,
  payback: ["shop", "payback"] as const,
  lotteryAdmin: ["shop", "lottery", "admin"] as const,
};

/* ── 에러 타입 ── */

export type ShopErrorCode =
  | "SHOP_CLOSED"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_QUANTITY"
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY"
  | "INVENTORY_FAILED_REFUNDED"
  | "REFUND_FAILED"
  | "INVALID_CART"
  | "MRBEAST_SODA_DAILY_LIMIT_EXCEEDED"
  | "STOCK_IMPACT_UNAVAILABLE"
  | "REORDER_NOT_AVAILABLE"
  | "LOTTERY_DISABLED"
  | "LOTTERY_MISCONFIGURED"
  | "LOTTERY_PREPARATION_FAILED"
  | "NO_LOTTERY_TICKET"
  | "LOTTERY_CLAIM_NOT_FOUND"
  | "LOTTERY_CLAIM_INVALID"
  | "PAYBACK_NOT_ELIGIBLE"
  | "PAYBACK_INTEGRITY_ERROR";

export class ShopApiError extends Error {
  readonly status: number;
  readonly code?: ShopErrorCode;
  readonly slug?: string;
  constructor(
    message: string,
    status: number,
    code?: ShopErrorCode,
    slug?: string,
  ) {
    super(message);
    this.name = "ShopApiError";
    this.status = status;
    this.code = code;
    this.slug = slug;
  }
}

/* ── 응답 타입 ── */

export interface ShopCatalogEntry extends RuntimeShopCatalogItem {
  stock: number;
  available: boolean;
}

export interface ShopCatalogResponse {
  items: ShopCatalogEntry[];
  isOpen: boolean;
  mode: "auto" | "open" | "closed";
  scheduledOpen: boolean;
  forceOpen: boolean;
  forceClosed: boolean;
}

export interface ShopInventoryItem {
  itemId: string;
  slug: string;
  name: string;
  quantity: number;
  /** ISO 8601 — 서버 응답이 toISOString() 결과. 클라이언트에서 new Date() 로 파싱. */
  acquiredAt: string;
  icon: string;
  effect: string;
  previewImage?: string;
}

export interface ShopInventoryResponse {
  items: ShopInventoryItem[];
  hasMainCharacter: boolean;
}

export interface ShopLotteryStateResponse {
  enabled: boolean;
  active: boolean;
  eventId: string | null;
  availableTickets: number;
  ticketCounts: {
    mrbeast_lottery: number;
    mrbeast_apology_lottery: number;
  };
  pendingClaim: MrBeastLotteryPendingClaimDto | null;
  recentWinners: MrBeastLotteryWinnerDto[];
}

export interface ShopPaybackResponse {
  status: "ELIGIBLE" | "INELIGIBLE" | "CLAIMED";
  purchasedQuantity: number;
  rewardQuantity: number;
  claimedAt: string | null;
}

export interface ShopLotteryAdminConfigResponse {
  enabled: boolean;
  active: boolean;
  eventId: string;
  startAt: string | null;
  endAt: string | null;
  version: number;
  updatedAt: string | null;
  updatedByName: string | null;
  readiness: {
    ready: boolean;
    indexesReady: boolean;
    masterItemReady: boolean;
    issues: string[];
  };
}

/* ── Fetchers ── */

async function parseShopError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: ShopErrorCode;
    slug?: string;
  };
  throw new ShopApiError(
    body.error ?? "편의점 API 호출에 실패했습니다.",
    res.status,
    body.code,
    body.slug,
  );
}

async function fetchShopCatalog(): Promise<ShopCatalogResponse> {
  const res = await fetch("/api/erp/shop/catalog", { cache: "no-store" });
  if (!res.ok) await parseShopError(res);
  return res.json();
}

async function fetchShopInventory(): Promise<ShopInventoryResponse> {
  const res = await fetch("/api/erp/shop/inventory");
  if (!res.ok) await parseShopError(res);
  return res.json();
}

async function fetchShopLotteryState(): Promise<ShopLotteryStateResponse> {
  const res = await fetch("/api/erp/shop/lottery", { cache: "no-store" });
  if (!res.ok) await parseShopError(res);
  return res.json();
}

async function fetchShopPayback(): Promise<ShopPaybackResponse> {
  const res = await fetch("/api/erp/shop/payback", { cache: "no-store" });
  if (!res.ok) await parseShopError(res);
  return res.json();
}

async function fetchShopLotteryAdminConfig(): Promise<ShopLotteryAdminConfigResponse> {
  const res = await fetch("/api/erp/shop/admin/lottery", {
    cache: "no-store",
  });
  if (!res.ok) await parseShopError(res);
  return res.json();
}

/* ── Hooks ── */

const CATALOG_STALE_TIME_MS = 10 * 60 * 1000;
const INVENTORY_STALE_TIME_MS = 5 * 60 * 1000;
const LOTTERY_STALE_TIME_MS = 15 * 1000;

function getMsUntilNextShopBoundary(now = new Date()): number {
  const boundary = getNextShopScheduleBoundary(now);
  return Math.max(1_000, boundary.getTime() - now.getTime() + 1_000);
}

export function useShopCatalog(options?: {
  initialData?: ShopCatalogResponse;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: shopKeys.catalog,
    queryFn: fetchShopCatalog,
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;

    const scheduleNextBoundary = () => {
      timeoutId = window.setTimeout(() => {
        if (!active) return;
        scheduleNextBoundary();
        void queryClient.invalidateQueries({ queryKey: shopKeys.catalog });
      }, getMsUntilNextShopBoundary());
    };

    scheduleNextBoundary();

    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [queryClient]);

  return query;
}

export function useShopInventory(options?: {
  initialData?: ShopInventoryResponse;
}) {
  return useQuery({
    queryKey: shopKeys.inventory,
    queryFn: fetchShopInventory,
    staleTime: INVENTORY_STALE_TIME_MS,
    initialData: options?.initialData,
    // 메인 캐릭 정합성 위반은 사용자 인풋으로 회복 불가 → 재시도 비활성.
    retry: (failureCount, err) => {
      if (err instanceof ShopApiError && err.status === 409) return false;
      return failureCount < 2;
    },
  });
}

export function useShopLotteryState(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shopKeys.lottery,
    queryFn: fetchShopLotteryState,
    staleTime: LOTTERY_STALE_TIME_MS,
    enabled: options?.enabled,
    refetchOnWindowFocus: true,
    // 비활성 → 활성 전환도 현재 페이지에서 감지해야 하므로 메인 캐릭터가 있으면 polling.
    refetchInterval:
      options?.enabled === false ? false : LOTTERY_STALE_TIME_MS,
    retry: (failureCount, err) => {
      if (
        err instanceof ShopApiError &&
        (err.code === "LOTTERY_DISABLED" ||
          err.code === "LOTTERY_MISCONFIGURED" ||
          err.code === "MAIN_CHARACTER_INTEGRITY")
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

export function useShopPayback(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shopKeys.payback,
    queryFn: fetchShopPayback,
    staleTime: LOTTERY_STALE_TIME_MS,
    enabled: options?.enabled,
    refetchOnWindowFocus: true,
    retry: (failureCount, err) => {
      if (
        err instanceof ShopApiError &&
        (err.code === "NO_MAIN_CHARACTER" ||
          err.code === "MAIN_CHARACTER_INTEGRITY")
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

export function useShopLotteryAdminConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shopKeys.lotteryAdmin,
    queryFn: fetchShopLotteryAdminConfig,
    staleTime: 0,
    enabled: options?.enabled,
    refetchOnWindowFocus: true,
    retry: (failureCount, err) => {
      if (err instanceof ShopApiError && [401, 403].includes(err.status)) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
