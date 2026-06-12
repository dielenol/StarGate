/**
 * 캐릭터 생성/편집 폼 공유 유틸 — CharacterCreateForm / CharacterEditForm 의
 * 로컬 사본(ABILITY_SLOTS, emptyEquipment, initAbilities, stringToTags)을 통합.
 */

import type { Ability, AbilitySlot, Equipment } from "@/types/character";

/** 캐릭터 시트 ability 슬롯 순서 (11 슬롯). */
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
] as const;

export function emptyEquipment(): Equipment {
  return { name: "", price: "", damage: "", ammo: "", grip: "", description: "" };
}

/** 11-슬롯 ability 초기화. 기존 ability 가 슬롯에 없으면 빈 슬롯으로 채움. */
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
