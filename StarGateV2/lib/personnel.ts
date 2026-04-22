/**
 * 인원 관리 — 열람 등급 판정 유틸
 */

import { ROLE_LEVEL_RANK } from "@stargate/shared-db";

import type { AgentLevel, Character, SheetBase } from "@/types/character";
import type { UserRole } from "@/types/user";

/* ── 등급 수치화 (rbac.ts와 동일 rank 공유) ── */

const LEVEL_RANK = ROLE_LEVEL_RANK;

/**
 * UI 표시용 정규화 rank (0~7).
 * Pips 등 0-N 스케일 컴포넌트용. 비교/정렬은 {@link getLevelRank} 사용.
 */
const LEVEL_DISPLAY_RANK: Record<AgentLevel, number> = {
  U: 0,
  J: 1,
  G: 2,
  H: 3,
  M: 4,
  A: 5,
  V: 6,
  GM: 7,
};

/* ── 필드 그룹별 최소 열람 등급 ── */

export type FieldGroup =
  | "identity"
  | "profile"
  | "combatStats"
  | "abilities"
  | "meta";

export const FIELD_REQUIRED_LEVEL: Record<FieldGroup, AgentLevel> = {
  identity: "G",
  profile: "H",
  combatStats: "H",
  abilities: "M",
  meta: "V",
};

export const FIELD_GROUP_ORDER: readonly FieldGroup[] = [
  "identity",
  "profile",
  "combatStats",
  "abilities",
  "meta",
] as const;

export const FIELD_GROUP_LABEL: Record<FieldGroup, string> = {
  identity: "IDENTITY",
  profile: "PROFILE",
  combatStats: "COMBAT STATS",
  abilities: "ABILITIES",
  meta: "META",
};

/* ── 사용자의 실효 열람 등급 ── */

/** 사용자 권한 = 클리어런스 (Phase 2-A에서 UserRole과 AgentLevel 일체화) */
export function getUserClearance(userRole: UserRole): AgentLevel {
  return userRole;
}

/* ── 필드 그룹 열람 가능 여부 ── */

export function canViewField(
  viewerLevel: AgentLevel,
  fieldGroup: FieldGroup,
): boolean {
  return LEVEL_RANK[viewerLevel] >= LEVEL_RANK[FIELD_REQUIRED_LEVEL[fieldGroup]];
}

/* ── 등급 비교 ── */

export function compareLevels(a: AgentLevel, b: AgentLevel): number {
  return LEVEL_RANK[a] - LEVEL_RANK[b];
}

export function getLevelRank(level: AgentLevel): number {
  return LEVEL_RANK[level];
}

/**
 * UI 표시용 0~7 스케일 rank.
 * Pips, lvScale 등 `total={N}` 기반 시각화 컴포넌트에 사용.
 * 비교/정렬 목적으로는 {@link getLevelRank} 를 사용해야 한다.
 */
export function getLevelDisplayRank(level: AgentLevel): number {
  return LEVEL_DISPLAY_RANK[level];
}

/* ── 서버사이드 데이터 필터링 (P1 보안) ── */

const REDACTED = "[CLASSIFIED]";

function redactSheetBase(sheet: SheetBase, clearance: AgentLevel): SheetBase {
  const canIdentity = canViewField(clearance, "identity");
  const canProfile = canViewField(clearance, "profile");

  return {
    codename: sheet.codename,
    name: canIdentity ? sheet.name : REDACTED,
    mainImage: canIdentity ? sheet.mainImage : "",
    quote: canProfile ? sheet.quote : REDACTED,
    gender: canIdentity ? sheet.gender : REDACTED,
    age: canIdentity ? sheet.age : REDACTED,
    height: canIdentity ? sheet.height : REDACTED,
    appearance: canIdentity ? sheet.appearance : REDACTED,
    personality: canProfile ? sheet.personality : REDACTED,
    background: canProfile ? sheet.background : REDACTED,
  };
}

/**
 * clearance 등급에 따라 캐릭터 sheet의 기밀 필드를 제거한다.
 * 서버 컴포넌트에서 클라이언트에 데이터를 전달하기 전에 호출.
 */
export function filterCharacterByClearance(
  character: Character,
  clearance: AgentLevel,
): Character {
  const canAbilities = canViewField(clearance, "abilities");
  const canCombat = canViewField(clearance, "combatStats");

  if (character.type === "AGENT") {
    const base = redactSheetBase(character.sheet, clearance);
    return {
      ...character,
      ownerId: canViewField(clearance, "meta") ? character.ownerId : null,
      sheet: {
        ...base,
        weight: canAbilities ? character.sheet.weight : REDACTED,
        className: character.sheet.className,
        hp: canCombat ? character.sheet.hp : 0,
        san: canCombat ? character.sheet.san : 0,
        def: canCombat ? character.sheet.def : 0,
        atk: canCombat ? character.sheet.atk : 0,
        abilityType: canAbilities ? character.sheet.abilityType : REDACTED,
        credit: canAbilities ? character.sheet.credit : REDACTED,
        weaponTraining: canAbilities ? character.sheet.weaponTraining : REDACTED,
        skillTraining: canAbilities ? character.sheet.skillTraining : REDACTED,
        equipment: canAbilities ? character.sheet.equipment : [],
        abilities: canAbilities ? character.sheet.abilities : [],
      },
    };
  }

  const base = redactSheetBase(character.sheet, clearance);
  const canProfile = canViewField(clearance, "profile");
  return {
    ...character,
    ownerId: canViewField(clearance, "meta") ? character.ownerId : null,
    sheet: {
      ...base,
      nameEn: canProfile ? character.sheet.nameEn : REDACTED,
      roleDetail: canProfile ? character.sheet.roleDetail : REDACTED,
      notes: canProfile ? character.sheet.notes : REDACTED,
    },
  };
}

/**
 * 목록용 캐릭터 필터링 — sheet.name만 clearance 체크.
 */
export function filterCharacterForList(
  character: Character,
  clearance: AgentLevel,
): Character {
  const canIdentity = canViewField(clearance, "identity");
  if (canIdentity) return character;

  return {
    ...character,
    sheet: {
      ...character.sheet,
      name: REDACTED,
    },
  } as Character;
}
