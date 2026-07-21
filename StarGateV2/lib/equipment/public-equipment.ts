const LEGACY_DEFAULT_ITEM_SLUG = new Map<string, string>([
  [
    "보급형 구식 전술 도검 & 경량 티타늄 합금 방패",
    "old-tactical-sword-titanium-shield",
  ],
  ["보급형 사냥용 소총", "basic-assault-rifle"],
  ["보급형 공격 방패", "basic-assault-shield"],
  ["악식의 콘치타", "conchita-of-gluttony"],
  ["CMMG Mk.47 Mutant (N.O.S.B Mod.)", "cmmg-mk47-mutant-nosb-mod"],
  ["택티컬 클레이모어", "tactical-claymore"],
]);

interface PublicInventoryEquipmentInput {
  itemName: string;
  slug?: string;
  price?: number | string;
  damage?: string;
  description?: string;
  effect?: string;
  equippedSlot?: string;
  isPublic?: boolean;
}

interface LegacyEquipmentInput {
  name: string;
  price?: number | string;
  damage?: string;
  description?: string;
}

export interface PublicEquipmentEntry {
  name: string;
  price: number | string;
  damage: string;
  description: string;
}

export function mergePublicEquipment(args: {
  inventoryEntries?: PublicInventoryEquipmentInput[];
  legacyEquipment: LegacyEquipmentInput[];
}): PublicEquipmentEntry[] {
  const inventoryEntries = args.inventoryEntries;
  const inventoryEquipment = (inventoryEntries ?? [])
    .filter((entry) => Boolean(entry.equippedSlot) && entry.isPublic !== false)
    .map((entry) => ({
      name: entry.itemName,
      price: entry.price ?? "",
      damage: entry.damage ?? "",
      description: entry.description ?? entry.effect ?? "",
    }));
  const inventoryNames = new Set(
    inventoryEntries?.map((entry) => entry.itemName) ?? [],
  );
  const inventorySlugs = new Set(
    inventoryEntries?.flatMap((entry) => (entry.slug ? [entry.slug] : [])) ?? [],
  );
  const unmatchedLegacyEquipment = args.legacyEquipment
    .filter((equipment) => {
      if (!inventoryEntries) return true;
      const mappedSlug = LEGACY_DEFAULT_ITEM_SLUG.get(equipment.name);
      return (
        !inventoryNames.has(equipment.name) &&
        (!mappedSlug || !inventorySlugs.has(mappedSlug))
      );
    })
    .map((equipment) => ({
      name: equipment.name,
      price: equipment.price ?? "",
      damage: equipment.damage ?? "",
      description: equipment.description ?? "",
    }));

  return [...inventoryEquipment, ...unmatchedLegacyEquipment];
}
