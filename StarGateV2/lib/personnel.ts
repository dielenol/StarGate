/**
 * 인원 관리 — 열람 등급 판정 유틸 + lore/play 마스킹
 *
 * Phase 1 sheet 분리 이후 마스킹은 lore / play 두 sub-document 단위로 분리:
 *  - lore: AGENT/NPC 공통 신원조회 source. /erp/personnel 에서 노출.
 *  - play: AGENT 전용 게임 시트. /erp/personnel 에서는 노출 안 함 — 다만 정합성 유지를 위해
 *    play 가 존재하는 AGENT 도큐먼트는 동일 함수에서 함께 마스킹된 결과를 반환한다.
 */

import { ROLE_LEVEL_RANK } from "@stargate/shared-db/types";

import type {
  AgentLevel,
  Character,
  LoreSheet,
  PlaySheet,
} from "@/types/character";
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

/**
 * lore sub-document 마스킹.
 * - identity 미달: name / nameNative / nickname / nameEn / gender / age / height / weight / mainImage 마스킹
 * - profile 미달: appearance / personality / background / quote / roleDetail / notes 마스킹
 *
 * weight 는 lore 영역으로 이동되었으므로 identity 그룹에서 마스킹 (구 abilities → identity 로 격상).
 *
 * Optional 필드(nameNative/nickname/nameEn/roleDetail/notes/posterImage) 는 원본이 undefined 면
 * 결과도 undefined 유지. "필드 자체가 없음" 과 "마스킹됨" 을 구분해야 검색 oracle 누출 방지.
 */
function redactLore(lore: LoreSheet, clearance: AgentLevel): LoreSheet {
  const canIdentity = canViewField(clearance, "identity");
  const canProfile = canViewField(clearance, "profile");

  // 필수 필드는 항상 마스킹 또는 원본
  const result: LoreSheet = {
    name: canIdentity ? lore.name : REDACTED,
    gender: canIdentity ? lore.gender : REDACTED,
    age: canIdentity ? lore.age : REDACTED,
    height: canIdentity ? lore.height : REDACTED,
    weight: canIdentity ? lore.weight : REDACTED,
    appearance: canProfile ? lore.appearance : REDACTED,
    personality: canProfile ? lore.personality : REDACTED,
    background: canProfile ? lore.background : REDACTED,
    quote: canProfile ? lore.quote : REDACTED,
    mainImage: canIdentity ? lore.mainImage : "",
  };

  // optional 필드 — 원본이 undefined 면 결과도 undefined 유지
  if (lore.nameNative !== undefined) {
    result.nameNative = canIdentity ? lore.nameNative : REDACTED;
  }
  if (lore.nickname !== undefined) {
    result.nickname = canIdentity ? lore.nickname : REDACTED;
  }
  if (lore.nameEn !== undefined) {
    result.nameEn = canIdentity ? lore.nameEn : REDACTED;
  }
  if (lore.roleDetail !== undefined) {
    result.roleDetail = canProfile ? lore.roleDetail : REDACTED;
  }
  if (lore.notes !== undefined) {
    result.notes = canProfile ? lore.notes : REDACTED;
  }
  if (lore.posterImage !== undefined) {
    result.posterImage = canIdentity ? lore.posterImage : "";
  }

  // 메타 배열 — 마스킹 대상 아님 (loreTags/appearsInEvents 는 V meta 그룹에서 일괄 처리)
  // 원본이 undefined 면 결과도 undefined 유지
  if (lore.loreTags !== undefined) {
    result.loreTags = lore.loreTags;
  }
  if (lore.appearsInEvents !== undefined) {
    result.appearsInEvents = lore.appearsInEvents;
  }

  return result;
}

/**
 * play sub-document 마스킹 (AGENT 전용).
 * - combatStats 미달: hp / san / def / atk / *Delta 모두 0
 * - abilities 미달: className 외 전부 마스킹 (className 은 dossier 라벨로 노출)
 *
 * /erp/personnel 은 play 자체를 노출하지 않으므로 본 함수의 결과는 직접 표시되지 않는다.
 * 그러나 `filterCharacterByClearance` 는 데이터 정합성을 위해 sub-document 를 같이 정리한다.
 */
function redactPlay(play: PlaySheet, clearance: AgentLevel): PlaySheet {
  const canCombat = canViewField(clearance, "combatStats");
  const canAbilities = canViewField(clearance, "abilities");

  return {
    className: play.className,
    hp: canCombat ? play.hp : 0,
    hpDelta: canCombat ? play.hpDelta : 0,
    san: canCombat ? play.san : 0,
    sanDelta: canCombat ? play.sanDelta : 0,
    def: canCombat ? play.def : 0,
    defDelta: canCombat ? play.defDelta : 0,
    atk: canCombat ? play.atk : 0,
    atkDelta: canCombat ? play.atkDelta : 0,
    abilityType: canAbilities ? play.abilityType : REDACTED,
    weaponTraining: canAbilities ? play.weaponTraining : [],
    skillTraining: canAbilities ? play.skillTraining : [],
    credit: canAbilities ? play.credit : REDACTED,
    equipment: canAbilities ? play.equipment : [],
    abilities: canAbilities ? play.abilities : [],
  };
}

/**
 * clearance 등급에 따라 캐릭터 lore/play 의 기밀 필드를 제거한다.
 * 서버 컴포넌트에서 클라이언트에 데이터를 전달하기 전에 호출.
 */
export function filterCharacterByClearance(
  character: Character,
  clearance: AgentLevel,
): Character {
  const canMeta = canViewField(clearance, "meta");

  if (character.type === "AGENT") {
    return {
      ...character,
      ownerId: canMeta ? character.ownerId : null,
      lore: redactLore(character.lore, clearance),
      play: redactPlay(character.play, clearance),
    };
  }

  return {
    ...character,
    ownerId: canMeta ? character.ownerId : null,
    lore: redactLore(character.lore, clearance),
  };
}

/**
 * 목록용 캐릭터 필터링 — lore.name 만 clearance 체크.
 * 카드/그룹핑 인덱스 단계에서 호출. 무거운 sub-document 마스킹은 회피.
 */
export function filterCharacterForList(
  character: Character,
  clearance: AgentLevel,
): Character {
  const canIdentity = canViewField(clearance, "identity");
  if (canIdentity) return character;

  return {
    ...character,
    lore: {
      ...character.lore,
      name: REDACTED,
    },
  } as Character;
}
