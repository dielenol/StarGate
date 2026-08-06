/**
 * 캐릭터 생성/편집 폼 공유 유틸 — CharacterCreateForm / CharacterEditForm 의
 * 로컬 사본(ABILITY_SLOTS, emptyEquipment, initAbilities, stringToTags)을 통합.
 */

import type { Ability, AbilitySlot, Equipment } from "@/types/character";
import { normalizeSkillTraining } from "../../../../lib/character/skill-training.ts";

/** 캐릭터 시트 ability 슬롯 순서 (12 슬롯). R은 캐릭터별 궁극기 전용 슬롯. */
export const ABILITY_SLOTS: readonly AbilitySlot[] = [
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "P",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "R",
] as const;

export function emptyEquipment(): Equipment {
  return { name: "", price: "", damage: "", ammo: "", grip: "", description: "" };
}

/** 12-슬롯 ability 초기화. 기존 ability 가 슬롯에 없으면 빈 슬롯으로 채움. */
export function initAbilities(existing: Ability[] = []): Ability[] {
  const map = new Map(existing.map((a) => [a.slot, a]));
  return ABILITY_SLOTS.map((slot) => map.get(slot) ?? { slot, name: "" });
}

/** 콤마/줄바꿈 구분 문자열 → 트림된 태그 배열. */
export function stringToTags(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** 신규 기술 훈련 문자열 → 표준화 및 중복 제거된 태그 배열. */
export function stringToSkillTraining(s: string): string[] {
  return normalizeSkillTraining(stringToTags(s));
}

/**
 * 편집 폼에서 표시값이 그대로라면 기존 배열을 보존한다.
 * 다른 필드만 저장할 때 레거시 충돌값을 암묵적으로 migration하지 않기 위함이다.
 */
export function stringToEditedSkillTraining(
  s: string,
  existing: readonly string[],
): string[] {
  if (s === existing.join(", ")) return [...existing];
  return stringToSkillTraining(s);
}
