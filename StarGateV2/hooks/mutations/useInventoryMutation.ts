import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreateMasterItemInput } from "@/types/inventory";

import { inventoryKeys } from "@/hooks/queries/useInventoryQuery";

interface GrantInventoryBody {
  itemId: string;
  itemName: string;
  quantity: number;
  note?: string;
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
