import { useQuery } from "@tanstack/react-query";

import type { MasterItem } from "@/types/inventory";

export const inventoryKeys = {
  all: ["inventory"] as const,
  items: ["inventory", "items"] as const,
};

async function fetchMasterItems(): Promise<MasterItem[]> {
  const res = await fetch("/api/erp/inventory/items");
  if (!res.ok) throw new Error("아이템 목록을 불러올 수 없습니다.");
  const data = await res.json();
  return data.items;
}

export function useInventoryItems(options?: {
  initialData?: MasterItem[];
}) {
  return useQuery({
    queryKey: inventoryKeys.items,
    queryFn: fetchMasterItems,
    staleTime: 5 * 60 * 1000,
    initialData: options?.initialData,
  });
}
