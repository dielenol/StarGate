import { useQuery } from "@tanstack/react-query";

import type {
  CharacterInventoryResponse,
  PublicMasterItemDto,
} from "@/types/inventory";

export const inventoryKeys = {
  all: ["inventory"] as const,
  items: ["inventory", "items"] as const,
  shared: ["inventory", "shared"] as const,
  byCharacter: (characterId: string) =>
    ["inventory", "character", characterId] as const,
};

export interface SharedInventoryResponse {
  inventory: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    acquiredAt: string;
    note?: string;
  }>;
}

async function fetchMasterItems(): Promise<PublicMasterItemDto[]> {
  const res = await fetch("/api/erp/inventory/items");
  if (!res.ok) throw new Error("아이템 목록을 불러올 수 없습니다.");
  const data = await res.json();
  return data.items;
}

async function fetchCharacterInventory(
  characterId: string,
): Promise<CharacterInventoryResponse> {
  const res = await fetch(`/api/erp/inventory/${characterId}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "캐릭터 인벤토리를 불러올 수 없습니다.");
  }
  return res.json();
}

async function fetchSharedInventory(): Promise<SharedInventoryResponse> {
  const res = await fetch("/api/erp/inventory/shared", { cache: "no-store" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "공용 인벤토리를 불러올 수 없습니다.");
  }
  return res.json();
}

export function useInventoryItems(options?: {
  initialData?: PublicMasterItemDto[];
}) {
  return useQuery({
    queryKey: inventoryKeys.items,
    queryFn: fetchMasterItems,
    staleTime: 30 * 60 * 1000,
    initialData: options?.initialData,
  });
}

export function useCharacterInventory(
  characterId: string,
  options?: { initialData?: CharacterInventoryResponse; enabled?: boolean },
) {
  return useQuery({
    queryKey: inventoryKeys.byCharacter(characterId),
    queryFn: () => fetchCharacterInventory(characterId),
    staleTime: 30 * 1000,
    initialData: options?.initialData,
    enabled: options?.enabled ?? true,
    refetchOnWindowFocus: true,
  });
}

export function useSharedInventory(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: inventoryKeys.shared,
    queryFn: fetchSharedInventory,
    staleTime: 30 * 1000,
    enabled: options?.enabled ?? true,
    refetchOnWindowFocus: true,
  });
}
