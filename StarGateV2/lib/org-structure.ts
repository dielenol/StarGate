/**
 * 조직 구조 매핑 유틸
 *
 * 캐릭터의 department 코드 → 최상위 그룹 (세력/기관) 매핑.
 */

import { FACTIONS, INSTITUTIONS } from "@/types/character";

/* ── 사무국 하위 기구 코드 → 상위 기관 매핑 ── */

const SUB_UNIT_TO_INSTITUTION: Record<string, string> = {};

for (const inst of INSTITUTIONS) {
  for (const unit of inst.subUnits) {
    SUB_UNIT_TO_INSTITUTION[unit.code] = inst.code;
  }
}

const FACTION_CODES = new Set<string>(FACTIONS.map((f) => f.code));
const INSTITUTION_CODES = new Set<string>(INSTITUTIONS.map((i) => i.code));

/** 레거시 department 코드 → 새 최상위 그룹 폴백 매핑 */
const LEGACY_DEPT_MAP: Record<string, string> = {
  HQ: "SECRETARIAT",
  FIELD: "MILITARY",
  SECURITY: "SECRETARIAT",
  LOGISTICS: "SECRETARIAT",
  EXTERNAL: "CIVIL",
};

/**
 * department 코드 → 최상위 그룹 코드.
 * - MILITARY, COUNCIL, CIVIL → 그대로 (세력)
 * - RESEARCH, ADMIN_BUREAU, INTL, CONTROL → "SECRETARIAT"
 * - FINANCE → 그대로 (기관)
 * - 레거시 코드 (HQ, FIELD 등) → 폴백 매핑
 * - 기타 → "UNASSIGNED"
 */
export function getTopLevelGroup(dept: string | undefined): string {
  if (!dept || dept === "UNASSIGNED") return "UNASSIGNED";
  if (FACTION_CODES.has(dept)) return dept;
  if (INSTITUTION_CODES.has(dept)) return dept;
  if (SUB_UNIT_TO_INSTITUTION[dept]) return SUB_UNIT_TO_INSTITUTION[dept];
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
/** 레거시 코드 → 라벨 폴백 */
const LEGACY_DEPT_LABELS: Record<string, string> = {
  HQ: "사무총장실",
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

  if (LEGACY_DEPT_LABELS[dept]) return LEGACY_DEPT_LABELS[dept];

  return dept;
}

/**
 * 기관의 하위 기구 목록 반환.
 */
export function getSubUnits(
  institutionCode: string,
): readonly { code: string; label: string }[] {
  const inst = INSTITUTIONS.find((i) => i.code === institutionCode);
  return inst?.subUnits ?? [];
}

/**
 * 코드가 세력(faction)인지 판별.
 */
export function isFaction(code: string): boolean {
  return FACTION_CODES.has(code);
}

/**
 * 코드가 독립 기관(institution)인지 판별.
 */
export function isInstitution(code: string): boolean {
  return INSTITUTION_CODES.has(code);
}
