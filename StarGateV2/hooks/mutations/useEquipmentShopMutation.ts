/**
 * 장비 판매점 구매 mutation hook.
 *
 * 카탈로그의 WEAPON/ARMOR 장비를 구매해 크레딧을 차감하고 인벤토리에 적재한다.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { creditKeys } from "@/hooks/queries/useCreditsQuery";
import { inventoryKeys } from "@/hooks/queries/useInventoryQuery";
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

async function throwEquipmentShopError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  throw new EquipmentShopApiError(
    body.error ?? "장비 판매점 요청에 실패했습니다.",
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
    },
  });
}
