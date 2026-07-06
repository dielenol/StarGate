import type { FactionCode } from "@/types/character";

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

export interface CivilPersonnelCategory {
  code: string;
  label: string;
  labelEn: string;
  summary: string;
  parentCode: "CIVIL";
  parentLabel: "시민사회";
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
    code: "USA",
    label: "미국",
    labelEn: "United States",
    summary: "군부 산하 미국 정치·군사·정보기관 라인",
    parentCode: "MILITARY",
    parentLabel: "군부",
    logoUrl: "",
    logoVariant: "badge",
    doctrine: "국가 권력 · 군사 정보망",
  },
  {
    code: "NOGA",
    label: "NOGA",
    labelEn: "Novus Ordo Great Again",
    summary: "군부 계열로 분류되는 인류 우월주의 폭력조직",
    parentCode: "MILITARY",
    parentLabel: "군부",
    logoUrl: "",
    logoVariant: "badge",
    doctrine: "인류 우월주의 · 반비인간 폭력",
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

export const CIVIL_PERSONNEL_CATEGORIES: readonly CivilPersonnelCategory[] = [
  {
    code: "NEON_VALKYRIE",
    label: "네온 발키리",
    labelEn: "NeON Valkyrie",
    summary: "뉴 더블린 펑크 바 및 임시 협력 거점",
    parentCode: "CIVIL",
    parentLabel: "시민사회",
    doctrine: "펑크 바 · 현장 협력",
  },
  {
    code: "NEW_DUBLIN",
    label: "뉴 더블린",
    labelEn: "New Dublin",
    summary: "뉴 더블린 도시권 민간·야간 세력 접점",
    parentCode: "CIVIL",
    parentLabel: "시민사회",
    doctrine: "도시 네트워크 · 후속 조사",
  },
  {
    code: "SONGSARI",
    label: "송사리",
    labelEn: "Songsari",
    summary: "송사리 호 및 탐정 라인 관련 인물",
    parentCode: "CIVIL",
    parentLabel: "시민사회",
    doctrine: "해상 사건 · 민간 탐정",
  },
] as const;

export function getExternalSubOrg(code: string): ExternalSubOrg | undefined {
  return EXTERNAL_SUB_ORGS.find((org) => org.code === code);
}

export function isExternalSubOrg(code: string): boolean {
  return Boolean(getExternalSubOrg(code));
}

export function getCivilPersonnelCategory(
  code: string,
): CivilPersonnelCategory | undefined {
  return CIVIL_PERSONNEL_CATEGORIES.find((category) => category.code === code);
}

export function isCivilPersonnelCategory(code: string): boolean {
  return Boolean(getCivilPersonnelCategory(code));
}
