/**
 * 병기부 카탈로그 query hook.
 *
 * - `useEquipmentShopCatalog`: GET /api/erp/equipment-shop/catalog
 * - 카탈로그 대상은 master_items 의 WEAPON/ARMOR 중 판매 가능한 항목.
 */

import { useQuery } from "@tanstack/react-query";

import type { EquipmentShopCatalogItem } from "@/lib/equipment-shop/catalog";

export const equipmentShopKeys = {
  all: ["equipment-shop"] as const,
  catalog: ["equipment-shop", "catalog"] as const,
};

export type EquipmentShopErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY"
  | "INVENTORY_FAILED_REFUNDED"
  | "REFUND_FAILED"
  | "INVALID_CART"
  | "ITEM_NOT_AVAILABLE"
  | "PRICE_NOT_SET";

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

const CATALOG_STALE_TIME_MS = 10 * 60 * 1000;

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
