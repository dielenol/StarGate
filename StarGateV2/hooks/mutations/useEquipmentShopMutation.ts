/**
 * 병기부 구매 / 연구소 적용 mutation hooks.
 *
 * 카탈로그 장비 구매는 크레딧 차감 + 인벤토리 적재를 처리한다.
 * 연구소 적용은 GM 전용 스탯 변경 API를 호출한다.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  characterKeys,
  personnelKeys,
} from "@/hooks/queries/useCharactersQuery";
import { characterChangeLogsKeys } from "@/hooks/queries/useCharacterChangeLogs";
import { creditKeys } from "@/hooks/queries/useCreditsQuery";
import { inventoryKeys } from "@/hooks/queries/useInventoryQuery";
import { notificationKeys } from "@/hooks/queries/useNotificationsQuery";
import {
  EquipmentShopApiError,
  equipmentShopKeys,
} from "@/hooks/queries/useEquipmentShopQuery";

interface CheckoutInput {
  items: Array<{
    key: string;
    quantity: number;
  }>;
}

interface CheckoutResponse {
  order: {
    items: Array<{
      key: string;
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    totalPrice: number;
  };
  balance: number;
}

export type EquipmentResearchScope = "personal" | "team";
export type EquipmentResearchStat = "hp" | "san" | "def" | "atk";

interface ResearchInput {
  scope: EquipmentResearchScope;
  stat: EquipmentResearchStat;
  amount: number;
  reason?: string;
}

interface ResearchResponse {
  scope: EquipmentResearchScope;
  stat: EquipmentResearchStat;
  amount: number;
  affected: number;
  skipped: number;
  auditFailed: number;
  targets: Array<{
    id: string;
    codename: string;
    before: number;
    after: number;
  }>;
}

async function throwEquipmentShopError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  throw new EquipmentShopApiError(
    body.error ?? "병기부 요청에 실패했습니다.",
    res.status,
    (body.code ?? undefined) as EquipmentShopApiError["code"],
  );
}

export function useCheckoutEquipmentShopCart() {
  const queryClient = useQueryClient();

  return useMutation<CheckoutResponse, EquipmentShopApiError, CheckoutInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.catalog });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useApplyEquipmentResearch() {
  const queryClient = useQueryClient();

  return useMutation<ResearchResponse, EquipmentShopApiError, ResearchInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: characterKeys.all });
      queryClient.invalidateQueries({ queryKey: personnelKeys.all });
      queryClient.invalidateQueries({ queryKey: characterChangeLogsKeys.all });
    },
  });
}
