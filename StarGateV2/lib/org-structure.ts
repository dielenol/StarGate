/**
 * 조직 구조 매핑 유틸
 *
 * 캐릭터의 department 코드 → 최상위 그룹 (외부 기관/내부 기관) 매핑.
 */

import { FACTIONS, INSTITUTIONS, INTERNAL_FACTION_CODE } from "@/types/character";
import {
  CIVIL_PERSONNEL_CATEGORIES,
  EXTERNAL_SUB_ORGS,
} from "@/lib/external-sub-orgs";

/* ── 사무국 하위 기구 코드 → 상위 내부 기관 매핑 ── */

const SUB_UNIT_TO_INSTITUTION: Record<string, string> = {};

for (const inst of INSTITUTIONS) {
  for (const unit of inst.subUnits) {
    SUB_UNIT_TO_INSTITUTION[unit.code] = inst.code;
  }
}

const FACTION_CODES = new Set<string>(FACTIONS.map((f) => f.code));
const INSTITUTION_CODES = new Set<string>(INSTITUTIONS.map((i) => i.code));
const EXTERNAL_SUB_ORG_BY_CODE = new Map(
  EXTERNAL_SUB_ORGS.map((org) => [org.code, org]),
);
const CIVIL_PERSONNEL_CATEGORY_BY_CODE = new Map(
  CIVIL_PERSONNEL_CATEGORIES.map((category) => [category.code, category]),
);

/** code → scope O(1) lookup. getFactionScope 가 매 호출마다 FACTIONS.find 를 돌지 않도록 사전 인덱싱. */
const FACTION_SCOPE_BY_CODE = new Map<string, "external" | "internal">(
  FACTIONS.map((f) => [f.code, f.scope]),
);

/** 레거시 department 코드 → 새 최상위 그룹 폴백 매핑
 *  HQ 는 SECRETARIAT.subUnits 정식 코드로 승격되어 폴백 불필요. */
const LEGACY_DEPT_MAP: Record<string, string> = {
  FIELD: "MILITARY",
  SECURITY: "SECRETARIAT",
  LOGISTICS: "SECRETARIAT",
  EXTERNAL: "CIVIL",
};

/**
 * department 코드 → 최상위 그룹 코드.
 * - MILITARY, COUNCIL, CIVIL → 그대로 (외부 기관)
 * - HQ, FINANCE, RESEARCH, ADMIN_BUREAU, INTL, CONTROL → "SECRETARIAT"
 * - SECTOR_A~E → "MANUS"
 * - MANUS → 그대로 (내부 기관)
 * - 레거시 코드 (FIELD 등) → 폴백 매핑
 * - 기타 → "UNASSIGNED"
 */
export function getTopLevelGroup(dept: string | undefined): string {
  if (!dept || dept === "UNASSIGNED") return "UNASSIGNED";
  if (FACTION_CODES.has(dept)) return dept;
  if (INSTITUTION_CODES.has(dept)) return dept;
  if (SUB_UNIT_TO_INSTITUTION[dept]) return SUB_UNIT_TO_INSTITUTION[dept];
  const externalSubOrg = EXTERNAL_SUB_ORG_BY_CODE.get(dept);
  if (externalSubOrg) return externalSubOrg.parentCode;
  const civilCategory = CIVIL_PERSONNEL_CATEGORY_BY_CODE.get(dept);
  if (civilCategory) return civilCategory.parentCode;
  if (LEGACY_DEPT_MAP[dept]) return LEGACY_DEPT_MAP[dept];
  return "UNASSIGNED";
}

/**
 * 최상위 그룹의 라벨을 반환.
 */
export function getGroupLabel(code: string): string {
  const faction = FACTIONS.find((f) => f.code === code);
  if (faction) return faction.label;

  const inst = INSTITUTIONS.find((i) => i.code === code);
  if (inst) return inst.label;

  if (code === "UNASSIGNED") return "미배정";
  return code;
}

/**
 * department 코드의 라벨을 반환 (하위 기구 포함).
 */
/** 레거시 코드 → 라벨 폴백
 *  HQ 라벨은 SECRETARIAT.subUnits 의 정식 항목에서 직접 도출. */
const LEGACY_DEPT_LABELS: Record<string, string> = {
  FIELD: "현장작전부",
  SECURITY: "보안국",
  LOGISTICS: "후방지원부",
  EXTERNAL: "외부협력",
};

export function getDepartmentLabel(dept: string | undefined): string {
  if (!dept) return "미배정";

  const faction = FACTIONS.find((f) => f.code === dept);
  if (faction) return faction.label;

  for (const inst of INSTITUTIONS) {
    if (inst.code === dept) return inst.label;
    const sub = inst.subUnits.find((u) => u.code === dept);
    if (sub) return sub.label;
  }

  const externalSubOrg = EXTERNAL_SUB_ORG_BY_CODE.get(dept);
  if (externalSubOrg) return externalSubOrg.label;

  const civilCategory = CIVIL_PERSONNEL_CATEGORY_BY_CODE.get(dept);
  if (civilCategory) return civilCategory.label;

  if (LEGACY_DEPT_LABELS[dept]) return LEGACY_DEPT_LABELS[dept];

  return dept;
}

/**
 * 내부 기관의 하위 기구 목록 반환.
 */
export function getSubUnits(
  institutionCode: string,
): readonly { code: string; label: string }[] {
  const inst = INSTITUTIONS.find((i) => i.code === institutionCode);
  return inst?.subUnits ?? [];
}

/**
 * 코드가 외부 기관(faction)인지 판별.
 *
 * 주의: NOVUS_ORDO 도 FACTIONS 에 포함되므로 isFaction(NOVUS_ORDO) === true.
 * "외부 권력 블록인지"만 보려면 `getFactionScope(code) === "external"` 사용.
 */
export function isFaction(code: string): boolean {
  return FACTION_CODES.has(code);
}

/**
 * 코드가 내부 기관(institution)인지 판별.
 */
export function isInstitution(code: string): boolean {
  return INSTITUTION_CODES.has(code);
}

/**
 * Faction code → scope 메타.
 *  - `external` — 외부 권력 블록 (MILITARY/COUNCIL/CIVIL)
 *  - `internal` — 노부스 오르도 본부 (NOVUS_ORDO)
 *  - `undefined` — faction 이 아닌 코드
 */
export function getFactionScope(
  code: string,
): "external" | "internal" | undefined {
  return FACTION_SCOPE_BY_CODE.get(code);
}

/**
 * Novus Ordo 내부 권한등급 체계를 쓰는 조직 코드인지 판정한다.
 *
 * NOVUS_ORDO 본부와 내부 기구(SECRETARIAT/MANUS 및 그 subUnit)만 true.
 * 외부 세력과 시민사회 하위조직(WHITE_ROSE/SPACE_ZERO 등)은 false.
 */
export function isInternalOrgCode(code: string | undefined | null): boolean {
  if (!code || code === "UNASSIGNED") return false;
  if (code === INTERNAL_FACTION_CODE) return true;
  if (INSTITUTION_CODES.has(code)) return true;

  const top = getTopLevelGroup(code);
  return top === INTERNAL_FACTION_CODE || INSTITUTION_CODES.has(top);
}

/**
 * 그룹 코드가 외부 기관(faction)/내부 기관(institution)/미배정 중 무엇인지 판정.
 * personnel 인덱스의 drill state crumb 와 dossier breadcrumb 양쪽에서 prefix(외부 기관:/내부 기관:/미배정)를 결정할 때 사용.
 *
 * NOTE: NOVUS_ORDO 도 `faction` 으로 분류된다. crumb prefix 분기에서 "외부 기관" / "본부"
 * 둘을 구분해야 한다면 추가로 `getFactionScope(code)` 를 확인해야 한다.
 */
export function getGroupKind(
  code: string,
): "faction" | "institution" | "unassigned" {
  if (code === "UNASSIGNED") return "unassigned";
  if (isFaction(code)) return "faction";
  if (EXTERNAL_SUB_ORG_BY_CODE.has(code)) return "faction";
  if (CIVIL_PERSONNEL_CATEGORY_BY_CODE.has(code)) return "faction";
  if (isInstitution(code)) return "institution";
  return "unassigned";
}
