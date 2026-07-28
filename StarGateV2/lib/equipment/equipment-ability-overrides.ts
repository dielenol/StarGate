import type {
  Ability,
  EquipmentAbilityOverride,
  EquipmentSlot,
} from "@stargate/shared-db/types";

interface EquippedAbilityOverrideSource {
  equippedSlot?: EquipmentSlot;
  equipmentAbilityOverrides?: readonly EquipmentAbilityOverride[];
}

const OVERRIDE_SLOT_ORDER: readonly EquipmentSlot[] = ["WEAPON", "ARMOR"];

function matchesTarget(ability: Ability, targetCode: string): boolean {
  return (
    ability.slot === targetCode ||
    ability.code?.trim() === targetCode
  );
}

export function applyEquipmentAbilityOverrides(
  abilities: readonly Ability[],
  equipment: readonly EquippedAbilityOverrideSource[] | undefined,
): Ability[] {
  const overrides = OVERRIDE_SLOT_ORDER.flatMap(
    (slot) =>
      equipment
        ?.filter((entry) => entry.equippedSlot === slot)
        .flatMap((entry) => entry.equipmentAbilityOverrides ?? []) ?? [],
  );

  return abilities.map((ability) => {
    let effect = ability.effect;
    for (const override of overrides) {
      const targetCode = override.targetCode.trim();
      if (matchesTarget(ability, targetCode)) {
        effect = override.effect;
      }
    }
    return effect === ability.effect ? ability : { ...ability, effect };
  });
}
