import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  CreateMasterItemInput,
  RemoveInventoryInput,
} from "@/types/inventory";

import { inventoryKeys } from "@/hooks/queries/useInventoryQuery";
import { equipmentShopKeys } from "@/hooks/queries/useEquipmentShopQuery";
import { notificationKeys } from "@/hooks/queries/useNotificationsQuery";
import { createIdempotencyKey } from "@/lib/query/idempotency";

interface GrantInventoryBody {
  itemId: string;
  itemName: string;
  quantity: number;
  note?: string;
}

interface RemoveInventoryResponse {
  remaining: number;
}

interface EquipInventoryResponse {
  success: true;
  slot: "WEAPON" | "ARMOR";
  previousItemId?: string;
}

export function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateMasterItemInput) => {
      const res = await fetch("/api/erp/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "아이템 생성에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.catalog });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useGrantInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      characterId,
      data,
    }: {
      characterId: string;
      data: GrantInventoryBody;
    }) => {
      const res = await fetch(`/api/erp/inventory/${characterId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "인벤토리 지급에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useRemoveInventory(characterId: string) {
  const queryClient = useQueryClient();

  return useMutation<RemoveInventoryResponse, Error, RemoveInventoryInput>({
    mutationFn: async (data) => {
      const res = await fetch(`/api/erp/inventory/${characterId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey(
            "inventory-remove",
            data,
          ),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err.error ?? "인벤토리 제거에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
      ]);
    },
  });
}

export function useGrantSharedInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GrantInventoryBody) => {
      const res = await fetch("/api/erp/inventory/shared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "공용 인벤토리 지급에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useEquipInventoryItem(characterId: string) {
  const queryClient = useQueryClient();

  return useMutation<EquipInventoryResponse, Error, { itemId: string }>({
    mutationFn: async ({ itemId }) => {
      const res = await fetch(
        `/api/erp/inventory/${characterId}/equipment`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "장비 교체에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.byCharacter(characterId),
      });
    },
  });
}
