import type { AgentCharacter, Character } from "@/types/character";
import type {
  PublicAgentDetail,
  PublicAgentSheet,
  PublicAgentSummary,
} from "@/types/public-player";

import { preferOptimizedPublicImagePath } from "@/lib/asset-path";
import { getPixelCharacterPath } from "@/lib/format/character-asset";

export function isPublicAgentWithSheet(
  character: Character | null | undefined,
): character is AgentCharacter {
  return Boolean(
    character &&
      character.type === "AGENT" &&
      character.isPublic &&
      character.lore &&
      character.play,
  );
}

export function toPublicAgentSummary(
  character: AgentCharacter,
): PublicAgentSummary {
  return {
    id: character._id?.toString() ?? character.codename,
    codename: character.codename,
    role: character.role,
    previewImage: preferOptimizedPublicImagePath(character.previewImage),
    pixelCharacterImage: preferOptimizedPublicImagePath(
      getPixelCharacterPath(character.codename) ??
        character.pixelCharacterImage ??
        "",
    ),
    warningVideo: character.warningVideo,
  };
}

export function toPublicAgentSheet(character: AgentCharacter): PublicAgentSheet {
  return {
    codename: character.codename,
    name: character.lore.name,
    mainImage: preferOptimizedPublicImagePath(character.lore.mainImage),
    quote: character.lore.quote,
    gender: character.lore.gender,
    age: character.lore.age,
    height: character.lore.height,
    weight: character.lore.weight,
    appearance: character.lore.appearance,
    personality: character.lore.personality,
    background: character.lore.background,
    className: character.play.className,
    hp: character.play.hp,
    san: character.play.san,
    def: character.play.def,
    atk: character.play.atk,
    abilityType: character.play.abilityType ?? "",
    credit: character.play.credit,
    weaponTraining: character.play.weaponTraining.join(", "),
    skillTraining: character.play.skillTraining.join(", "),
    equipment: character.play.equipment.map((equipment) => ({
      name: equipment.name,
      price: equipment.price ?? "",
      damage: equipment.damage ?? "",
      description: equipment.description ?? "",
    })),
    abilities: character.play.abilities.map((ability) => ({
      code: ability.code ?? ability.slot,
      name: ability.name,
      description: ability.description ?? "",
      effect: ability.effect ?? "",
    })),
  };
}

export function toPublicAgentDetail(character: AgentCharacter): PublicAgentDetail {
  return {
    ...toPublicAgentSummary(character),
    sheet: toPublicAgentSheet(character),
  };
}
