/**
 * 편의점 구매 / 소비 mutation hooks.
 *
 * - `useBuyShopItem`: POST /api/erp/shop/buy — 재고/잔액/인벤 3-step Saga.
 * - `useCheckoutShopCart`: POST /api/erp/shop/checkout — 장바구니 일괄 결제.
 * - `useRequestShopReorder`: POST /api/erp/shop/reorder-request — 품절 상품 발주 요청.
 * - `useConsumeShopItem`: POST /api/erp/shop/consume — 보유 인벤 차감만.
 *
 * 에러 — 서버 응답 `{ error, code }` 를 `ShopApiError` 로 wrap (UI 분기 가능).
 *
 * 성공 시 invalidate 정책:
 * - buy: 카탈로그(재고) + 보유 인벤 + 크레딧 잔액/ledger 모두 갱신.
 * - consume: 보유 인벤만. 크레딧/카탈로그 변동 없음.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { creditKeys } from "@/hooks/queries/useCreditsQuery";
import { notificationKeys } from "@/hooks/queries/useNotificationsQuery";
import {
  ShopApiError,
  shopKeys,
  type ShopCatalogResponse,
} from "@/hooks/queries/useShopQuery";

/* ── 입력/응답 타입 ── */

interface BuyInput {
  slug: string;
  quantity: number;
}

interface BuyResponse {
  purchase: {
    slug: string;
    name: string;
    quantity: number;
    totalPrice: number;
  };
  balance: number;
}

interface CheckoutInput {
  items: Array<{
    slug: string;
    quantity: number;
  }>;
}

interface CheckoutResponse {
  order: {
    items: Array<{
      slug: string;
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    totalPrice: number;
  };
  balance: number;
}

interface ReorderInput {
  slug: string;
}

interface ReorderResponse {
  ok: boolean;
  status: "requested" | "already-requested";
  slug: string;
  message: string;
}

interface ConsumeInput {
  slug: string;
  quantity: number;
}

interface ConsumeResponse {
  remaining: number;
}

export type ShopOpenMode = "auto" | "open" | "closed";

interface SetShopOpenModeInput {
  mode: ShopOpenMode;
}

interface ShopOpenStateResponse {
  mode: ShopOpenMode;
  scheduledOpen: boolean;
  forceOpen: boolean;
  forceClosed: boolean;
  isOpen: boolean;
  updatedAt: string | null;
  updatedById: string | null;
  updatedByName: string | null;
}

/* ── 공통 에러 파서 ── */

async function throwShopError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    slug?: string;
  };
  throw new ShopApiError(
    body.error ?? "편의점 요청에 실패했습니다.",
    res.status,
    // ShopErrorCode 외 값이 와도 string 그대로 보존.
    (body.code ?? undefined) as ShopApiError["code"],
    body.slug,
  );
}

/* ── Hooks ── */

export function useBuyShopItem() {
  const queryClient = useQueryClient();

  return useMutation<BuyResponse, ShopApiError, BuyInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwShopError(res);
      return res.json();
    },
    onSuccess: () => {
      // 재고(catalog) + 보유 인벤 + 잔액/ledger 모두 변동 — 명시 분리.
      queryClient.invalidateQueries({ queryKey: shopKeys.catalog });
      queryClient.invalidateQueries({ queryKey: shopKeys.inventory });
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useCheckoutShopCart() {
  const queryClient = useQueryClient();

  return useMutation<CheckoutResponse, ShopApiError, CheckoutInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shopKeys.catalog });
      queryClient.invalidateQueries({ queryKey: shopKeys.inventory });
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useRequestShopReorder() {
  const queryClient = useQueryClient();

  return useMutation<ReorderResponse, ShopApiError, ReorderInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/shop/reorder-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useConsumeShopItem() {
  const queryClient = useQueryClient();

  return useMutation<ConsumeResponse, ShopApiError, ConsumeInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/shop/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwShopError(res);
      return res.json();
    },
    onSuccess: () => {
      // 보유 인벤 + 알림 변동.
      queryClient.invalidateQueries({ queryKey: shopKeys.inventory });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useSetShopOpenMode() {
  const queryClient = useQueryClient();

  return useMutation<
    ShopOpenStateResponse,
    ShopApiError,
    SetShopOpenModeInput
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/shop/admin/open", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwShopError(res);
      return res.json();
    },
    onSuccess: (state) => {
      queryClient.setQueryData<ShopCatalogResponse>(
        shopKeys.catalog,
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            isOpen: state.isOpen,
            mode: state.mode,
            scheduledOpen: state.scheduledOpen,
            forceOpen: state.forceOpen,
            forceClosed: state.forceClosed,
            items: prev.items.map((item) => ({
              ...item,
              available: state.isOpen && item.stock > 0,
            })),
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: shopKeys.catalog });
    },
  });
}
