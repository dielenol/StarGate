import type { AgentLevel, FactionCode, InstitutionCode } from "@/types/character";

export interface ExternalSubOrg {
  code: string;
  label: string;
  labelEn: string;
  summary: string;
  parentCode: FactionCode;
  parentLabel: string;
  logoUrl: string;
  logoVariant: "badge" | "wide";
  doctrine: string;
}

export const EXTERNAL_SUB_ORGS: readonly ExternalSubOrg[] = [
  {
    code: "WHITE_ROSE",
    label: "백장미단",
    labelEn: "White Rose",
    summary: "시민사회 급진파",
    parentCode: "CIVIL",
    parentLabel: "시민사회",
    logoUrl: "/assets/faction/white_rose_logo.png",
    logoVariant: "badge",
    doctrine: "급진 인권운동 · 정보공개",
  },
  {
    code: "SPACE_ZERO",
    label: "스페이스 제로",
    labelEn: "Space Zero",
    summary: "기술자본 세력",
    parentCode: "CIVIL",
    parentLabel: "시민사회",
    logoUrl: "/assets/faction/space_zero_logo.png",
    logoVariant: "wide",
    doctrine: "기술 자본 · 글로벌 시장",
  },
  {
    code: "GOLDEN_DAWN",
    label: "황금여명회",
    labelEn: "Golden Dawn",
    summary: "작전 기록상 적대 컬트 세력으로 분류된 비정규 조직",
    parentCode: "HOSTILE",
    parentLabel: "적대세력",
    logoUrl: "",
    logoVariant: "badge",
    doctrine: "오컬트 컬트 · 무장 적대",
  },
  {
    code: "AHNENERBE",
    label: "아넨에르베 \"광명회\"",
    labelEn: "Ahnenerbe Illuminati",
    summary: "광명회 및 아넨에르베 계열로 추적되는 적대 연구 세력",
    parentCode: "HOSTILE",
    parentLabel: "적대세력",
    logoUrl: "",
    logoVariant: "badge",
    doctrine: "비밀 연구 · 침투 의혹",
  },
] as const;

export function getExternalSubOrg(code: string): ExternalSubOrg | undefined {
  return EXTERNAL_SUB_ORGS.find((org) => org.code === code);
}

export function isExternalSubOrg(code: string): boolean {
  return Boolean(getExternalSubOrg(code));
}

/* ── 외부 기관/내부 기관 보조 메타데이터 ──
   FACTIONS(외부 기관) / INSTITUTIONS(내부 기관) 기본 스키마(`shared-db`)에는 code/label/labelEn 만 있어
   UI 전용 추가 정보(교리·워터마크 로고·감독 영역)는 여기 로컬에 둔다.
   OrgCanvas(L1) 와 GroupHero(L2) 에서 공유. */

export const FACTION_LOGO: Record<FactionCode, string> = {
  COUNCIL: "/assets/faction/world_council_logo.webp",
  MILITARY: "/assets/faction/military_logo.webp",
  CIVIL: "/assets/faction/civil_society_logo.webp",
  HOSTILE: "",
  // NOVUS_ORDO 는 본부 자체 — 메인 로고를 직접 사용.
  NOVUS_ORDO: "/assets/StarGate_logo.webp",
} as const;

export const FACTION_DOCTRINE: Record<FactionCode, string> = {
  COUNCIL: "최고 의결 · 3권 균형 감시",
  MILITARY: "무력 통제 · 외적 방위",
  CIVIL: "시민 대표 · 사회 기반",
  HOSTILE: "위협 분류 · 작전상 적대",
  NOVUS_ORDO: "본부 통할 · 내부 기관 총괄",
} as const;

/**
 * string-typed code 에서 안전 조회용 helper. caller 가 `string`(selectedGroup 등)을
 * 보유한 경우 사용. 알려지지 않은 code 면 undefined 반환.
 */
export function getFactionLogo(code: string): string | undefined {
  return FACTION_LOGO[code as FactionCode] ?? getExternalSubOrg(code)?.logoUrl;
}

export function getFactionDoctrine(code: string): string | undefined {
  return (
    FACTION_DOCTRINE[code as FactionCode] ?? getExternalSubOrg(code)?.doctrine
  );
}

export const INSTITUTION_LOGO = "/assets/StarGate_logo_watermark.webp";

export const INSTITUTION_DOCTRINE: Record<InstitutionCode, string> = {
  SECRETARIAT: "의회 운영 · 행정 총괄",
  MANUS: "섹터 작전 수행 · 현장 관리",
} as const;

export function getInstitutionDoctrine(code: string): string | undefined {
  return INSTITUTION_DOCTRINE[code as InstitutionCode];
}

/** subUnits 가 있는 기관은 GroupHero/OrgCanvas 의 SUB UNITS 분기로 흡수되어
 *  oversight 분기가 실행되지 않는다. subUnits 가 없는 기관에만 의미 있음. */
export const INSTITUTION_OVERSIGHT: Record<string, string | undefined> = {};

/** DISTRIBUTION 분포 표기 순서 (상위 → 하위) */
export const LEVEL_ORDER: AgentLevel[] = ["V", "A", "M", "H", "G", "J", "U"];
