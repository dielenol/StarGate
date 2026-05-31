/**
 * 편의점 카탈로그 / 보유 인벤토리 query hooks.
 *
 * - `useShopCatalog`: GET /api/erp/shop/catalog — 전체 품목 + 일자별 재고 + 영업 여부.
 * - `useShopInventory`: GET /api/erp/shop/inventory — 본인 메인 캐릭의 보유 편의점 아이템.
 *
 * 에러 분기 — `ShopApiError.code` 로 클라이언트가 분기 가능 (creditKeys 와 동일 패턴).
 */

import { useQuery } from "@tanstack/react-query";

import type { ShopCatalogItem } from "@/lib/shop/catalog";

/* ── Query keys ── */

export const shopKeys = {
  all: ["shop"] as const,
  catalog: ["shop", "catalog"] as const,
  inventory: ["shop", "inventory"] as const,
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
  | "REORDER_NOT_AVAILABLE";

export class ShopApiError extends Error {
  readonly status: number;
  readonly code?: ShopErrorCode;
  constructor(message: string, status: number, code?: ShopErrorCode) {
    super(message);
    this.name = "ShopApiError";
    this.status = status;
    this.code = code;
  }
}

/* ── 응답 타입 ── */

export interface ShopCatalogEntry extends ShopCatalogItem {
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
}

export interface ShopInventoryResponse {
  items: ShopInventoryItem[];
  hasMainCharacter: boolean;
}

/* ── Fetchers ── */

async function parseShopError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: ShopErrorCode;
  };
  throw new ShopApiError(
    body.error ?? "편의점 API 호출에 실패했습니다.",
    res.status,
    body.code,
  );
}

async function fetchShopCatalog(): Promise<ShopCatalogResponse> {
  const res = await fetch("/api/erp/shop/catalog");
  if (!res.ok) await parseShopError(res);
  return res.json();
}

async function fetchShopInventory(): Promise<ShopInventoryResponse> {
  const res = await fetch("/api/erp/shop/inventory");
  if (!res.ok) await parseShopError(res);
  return res.json();
}

/* ── Hooks ── */

const CATALOG_STALE_TIME_MS = 5 * 60 * 1000;
const INVENTORY_STALE_TIME_MS = 2 * 60 * 1000;

export function useShopCatalog(options?: {
  initialData?: ShopCatalogResponse;
}) {
  return useQuery({
    queryKey: shopKeys.catalog,
    queryFn: fetchShopCatalog,
    staleTime: CATALOG_STALE_TIME_MS,
    initialData: options?.initialData,
  });
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
