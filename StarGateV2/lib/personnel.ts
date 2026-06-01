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

const LEVEL_DISPLAY_TOTAL = 6;
const GM_LEVEL_DISPLAY_TOTAL = LEVEL_DISPLAY_TOTAL + 1;

/* ── 필드 그룹별 최소 열람 등급 ── */

export type FieldGroup =
  | "identity"
  | "profile"
  | "combatStats"
  | "abilities"
  | "meta";

/**
 * 필드 그룹별 최소 열람 등급.
 *
 * 정책 (2026-05 재조정):
 *   - 운영 인구의 다수가 J 등급 위주라 J 가 아무 정보도 못 보면 신원조회 페이지가 무용지물.
 *   - identity / profile 은 J 도 볼 수 있게 풀고, combatStats / abilities 는 단계적 게이트 유지.
 *
 * 등급 계층: U < J < G < H < M < A < V < GM
 */
export const FIELD_REQUIRED_LEVEL: Record<FieldGroup, AgentLevel> = {
  identity: "U", // codename / type / 소속(faction/institution/department) / agentLevel — 모두 노출
  profile: "J", // 외모 / 성격 / 배경 (lore) — J 부터
  combatStats: "G", // HP / SAN / ATK / DEF / 등급별 stat — G 부터
  abilities: "H", // 어빌리티 11 슬롯 — H 부터
  meta: "V", // GM 운영 메타 (createdAt 등) — V 부터
};

export const REAL_NAME_REQUIRED_LEVEL: AgentLevel = "G";

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

/**
 * 박스(FieldGroup) 단위 노출 권한 오버라이드 맵.
 *
 * 캐릭터별 박스별 노출 등급을 GM 이 미세조정할 때 사용한다.
 * 키가 누락되면 `FIELD_REQUIRED_LEVEL` 기본값으로 fallback — undefined 와 명시적 누락을 동일하게 처리.
 */
export type ClearanceOverrides = Partial<Record<FieldGroup, AgentLevel>>;

/**
 * 특정 fieldGroup 의 효력 요구 등급을 반환.
 * `overrides` 에 명시된 값이 있으면 그것을, 없으면 `FIELD_REQUIRED_LEVEL` 기본값을 사용.
 */
export function getRequiredLevel(
  fieldGroup: FieldGroup,
  overrides?: ClearanceOverrides | null,
): AgentLevel {
  return overrides?.[fieldGroup] ?? FIELD_REQUIRED_LEVEL[fieldGroup];
}

export function getRealNameRequiredLevel(
  overrides?: ClearanceOverrides | null,
): AgentLevel {
  const identityRequired = getRequiredLevel("identity", overrides);
  return LEVEL_RANK[identityRequired] > LEVEL_RANK[REAL_NAME_REQUIRED_LEVEL]
    ? identityRequired
    : REAL_NAME_REQUIRED_LEVEL;
}

export function canViewRealName(
  viewerLevel: AgentLevel,
  overrides?: ClearanceOverrides | null,
): boolean {
  return LEVEL_RANK[viewerLevel] >= LEVEL_RANK[getRealNameRequiredLevel(overrides)];
}

export function canViewField(
  viewerLevel: AgentLevel,
  fieldGroup: FieldGroup,
  overrides?: ClearanceOverrides | null,
): boolean {
  const required = getRequiredLevel(fieldGroup, overrides);
  return LEVEL_RANK[viewerLevel] >= LEVEL_RANK[required];
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

export function getLevelDisplayTotal(level: AgentLevel): number {
  return level === "GM" ? GM_LEVEL_DISPLAY_TOTAL : LEVEL_DISPLAY_TOTAL;
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
function redactLore(
  lore: LoreSheet,
  clearance: AgentLevel,
  overrides?: ClearanceOverrides | null,
): LoreSheet {
  const canIdentity = canViewField(clearance, "identity", overrides);
  const canRealName = canViewRealName(clearance, overrides);
  const canProfile = canViewField(clearance, "profile", overrides);

  // 필수 필드는 항상 마스킹 또는 원본
  const result: LoreSheet = {
    name: canRealName ? lore.name : REDACTED,
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
    result.nameNative = canRealName ? lore.nameNative : REDACTED;
  }
  if (lore.nickname !== undefined) {
    result.nickname = canIdentity ? lore.nickname : REDACTED;
  }
  if (lore.nameEn !== undefined) {
    result.nameEn = canRealName ? lore.nameEn : REDACTED;
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
function redactPlay(
  play: PlaySheet,
  clearance: AgentLevel,
  overrides?: ClearanceOverrides | null,
): PlaySheet {
  const canCombat = canViewField(clearance, "combatStats", overrides);
  const canAbilities = canViewField(clearance, "abilities", overrides);

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
    points: canAbilities ? (play.points ?? 0) : 0,
    abilityType: canAbilities ? play.abilityType : REDACTED,
    weaponTraining: canAbilities ? play.weaponTraining : [],
    skillTraining: canAbilities ? play.skillTraining : [],
    credit: canAbilities ? play.credit : REDACTED,
    equipment: canAbilities ? play.equipment : [],
    abilities: canAbilities ? play.abilities : [],
  };
}

/**
 * shared-db 가 갖고 있는 `Partial<Record<string, RoleLevel>>` 형 값을 본 모듈의
 * `FieldGroup` 키로 좁힌다. 유효 FieldGroup 키 + 유효 AgentLevel 값만 통과.
 *
 * shared-db 는 도메인 무지를 유지하기 위해 키를 string 으로 두고, 본 모듈에서
 * runtime 검증으로 좁혀 사용한다. 잘못된 키/값은 silently 무시되어 fallback 동작.
 */
export function normalizeClearanceOverrides(
  raw: Partial<Record<string, string>> | null | undefined,
): ClearanceOverrides | undefined {
  if (!raw) return undefined;
  const out: ClearanceOverrides = {};
  for (const group of FIELD_GROUP_ORDER) {
    const v = raw[group];
    if (v !== undefined && v in LEVEL_RANK) {
      out[group] = v as AgentLevel;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * clearance 등급에 따라 캐릭터 lore/play 의 기밀 필드를 제거한다.
 * 서버 컴포넌트에서 클라이언트에 데이터를 전달하기 전에 호출.
 *
 * `character.clearanceOverrides` 가 있으면 박스(FieldGroup) 단위로 요구 등급을
 * 재정의한다. 잘못된 키/값은 silently 무시 → 기본값(`FIELD_REQUIRED_LEVEL`) fallback.
 */
export function filterCharacterByClearance(
  character: Character,
  clearance: AgentLevel,
): Character {
  const overrides = normalizeClearanceOverrides(character.clearanceOverrides);
  const canMeta = canViewField(clearance, "meta", overrides);

  if (character.type === "AGENT") {
    return {
      ...character,
      ownerId: canMeta ? character.ownerId : null,
      lore: redactLore(character.lore, clearance, overrides),
      play: redactPlay(character.play, clearance, overrides),
    };
  }

  return {
    ...character,
    ownerId: canMeta ? character.ownerId : null,
    lore: redactLore(character.lore, clearance, overrides),
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
  const overrides = normalizeClearanceOverrides(character.clearanceOverrides);
  const canRealName = canViewRealName(clearance, overrides);
  if (canRealName) return character;

  return {
    ...character,
    lore: {
      ...character.lore,
      name: REDACTED,
    },
  } as Character;
}
