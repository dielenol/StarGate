import type { EquipmentResearchScope } from "@stargate/core/domain/equipment-research";

export * from "@stargate/core/domain/equipment-research";

interface EquipmentResearchProjectVisibility {
  scope: EquipmentResearchScope;
  targetCharacterIds: string[];
}

export function filterEquipmentResearchProjectsForCharacter<
  T extends EquipmentResearchProjectVisibility,
>(
  projects: T[],
  mainCharacterId: string | null,
): T[] {
  return projects.filter(
    (project) =>
      project.scope === "team" ||
      (mainCharacterId !== null &&
        project.targetCharacterIds.includes(mainCharacterId)),
  );
}
