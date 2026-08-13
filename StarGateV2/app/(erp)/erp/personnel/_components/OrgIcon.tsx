import type { CSSProperties } from "react";

import type { FactionCode, InstitutionCode } from "@/types/character";
import { INSTITUTIONS } from "@/types/character";

/**
 * 조직도 add-on 아이콘 세트 (NOVUS Icon Set — Organization Add-on).
 *
 * - viewBox 24×24, stroke 1.5, currentColor.
 * - **Source of truth = 아래 ICONS map 의 inline path**.
 *   `/public/assets/svg/org_*.svg` 의 동일본은 외부 도구 / 디자이너 공유용 mirror 이며,
 *   디자이너가 SVG 만 수정해도 컴포넌트는 따라가지 않는다. **변경 시 양쪽 모두 동기화 필수**.
 * - inline path 매핑으로 React 단에서 렌더 (CSS color 컨트롤 + zero network).
 *
 * Mirror 파일 네이밍 규칙:
 *   - `org_root.svg`, `org_unassigned.svg`, `org_person.svg` — 단독 표식
 *   - `org_faction_<lowercase>.svg` — 외부 기관 (예: org_faction_council.svg)
 *   - `org_institution_<lowercase>.svg` — 내부 기관 (예: org_institution_manus.svg)
 *   - `org_subunit_<snake_case>.svg` — 기관 산하 sub-unit (예: org_subunit_sector_a.svg)
 *   - `org_scope_<lowercase>.svg` — 캐릭터 분류 스코프
 *   - `org_civil_<snake_case>.svg` — 시민사회 내부 분류 (예: org_civil_neon_valkyrie.svg)
 *   - `org_extorg_<snake_case>.svg` — 외부 세력 산하 조직 (예: org_extorg_golden_dawn.svg)
 */

/** INSTITUTIONS 상수에서 자동 추출한 sub-unit code union. INSTITUTIONS 변경 시 자동 추종 — SUBUNIT_ICON_MAP 누락이 컴파일 타임에 잡힘. */
export type SubUnitCode = (typeof INSTITUTIONS)[number]["subUnits"][number]["code"];

export type OrgIconCode =
  | "ROOT"
  | "UNASSIGNED"
  | "PERSON"
  // SECRETARIAT 산하 sub-unit
  | "HQ"
  | "RESEARCH"
  | "ADMIN_BUREAU"
  | "ARMORY_BUREAU"
  | "INTL"
  | "CONTROL"
  | "FINANCE"
  // MANUS 산하 섹터 sub-unit
  | "SECTOR_A"
  | "SECTOR_B"
  | "SECTOR_C"
  | "SECTOR_D"
  | "SECTOR_E"
  // 외부 권력 블록 (Faction · scope=external)
  | "COUNCIL"
  | "MILITARY"
  | "CIVIL"
  | "HOSTILE"
  // 본부 (Faction · scope=internal)
  | "NOVUS_ORDO"
  // 내부 기관 (Institution)
  | "SECRETARIAT"
  | "MANUS"
  // 캐릭터 분류 (Tier scope)
  | "ALL"
  | "MAIN"
  | "MINI"
  // 시민사회 내부 분류 (CivilPersonnelCategory)
  | "NEON_VALKYRIE"
  | "NEW_DUBLIN"
  | "SONGSARI"
  // 외부 세력 산하 조직 (ExternalSubOrg — 로고 이미지가 없는 조직만)
  | "USA"
  | "RUSSIA"
  | "NOGA"
  | "GALLOGLA"
  | "JOMSVIKING"
  | "GOLDEN_DAWN"
  | "AHNENERBE";

type IconPath = {
  /** path / shape 노드 raw markup. <svg> wrapper 는 컴포넌트가 추가. */
  body: string;
};

/** Sub-unit code → OrgIconCode 매핑. INSTITUTIONS 의 subUnits 추가 시 컴파일 타임에 누락 catch. */
export const SUBUNIT_ICON_MAP: Record<SubUnitCode, OrgIconCode> = {
  HQ: "HQ",
  RESEARCH: "RESEARCH",
  ADMIN_BUREAU: "ADMIN_BUREAU",
  ARMORY_BUREAU: "ARMORY_BUREAU",
  INTL: "INTL",
  CONTROL: "CONTROL",
  FINANCE: "FINANCE",
  SECTOR_A: "SECTOR_A",
  SECTOR_B: "SECTOR_B",
  SECTOR_C: "SECTOR_C",
  SECTOR_D: "SECTOR_D",
  SECTOR_E: "SECTOR_E",
};

/** Faction code → OrgIconCode 매핑. FACTIONS 변경 시 컴파일 타임에 누락 catch. */
export const FACTION_ICON_MAP: Record<FactionCode, OrgIconCode> = {
  COUNCIL: "COUNCIL",
  MILITARY: "MILITARY",
  CIVIL: "CIVIL",
  HOSTILE: "HOSTILE",
  NOVUS_ORDO: "NOVUS_ORDO",
};

/** Institution code → OrgIconCode 매핑. INSTITUTIONS 변경 시 컴파일 타임에 누락 catch. */
export const INSTITUTION_ICON_MAP: Record<InstitutionCode, OrgIconCode> = {
  SECRETARIAT: "SECRETARIAT",
  MANUS: "MANUS",
};

/* ── Lookup helpers ──
   `Record<NarrowCode, OrgIconCode>` 는 컴파일 타임 누락 catch 에 유리하지만
   caller 가 `string` (DB 자유 텍스트 / state) 을 index 하면 TS7053 가 뜬다.
   helper 는 string 입력을 받아 매핑 hit 시 OrgIconCode, miss 시 undefined 를 반환.
   FACTIONS/INSTITUTIONS 의 element.code 처럼 이미 narrow 한 키를 가진 caller 는
   Map 직접 access 도 그대로 사용 가능. */

export function getSubUnitIcon(code: string): OrgIconCode | undefined {
  return SUBUNIT_ICON_MAP[code as SubUnitCode];
}

export function getFactionIcon(code: string): OrgIconCode | undefined {
  return FACTION_ICON_MAP[code as FactionCode];
}

export function getInstitutionIcon(code: string): OrgIconCode | undefined {
  return INSTITUTION_ICON_MAP[code as InstitutionCode];
}

/** 시민사회 내부 분류 code → OrgIconCode. lib/external-sub-orgs.ts 의 CIVIL_PERSONNEL_CATEGORIES 와 code 를 공유. */
const CIVIL_CATEGORY_ICON_MAP: Record<string, OrgIconCode> = {
  NEON_VALKYRIE: "NEON_VALKYRIE",
  NEW_DUBLIN: "NEW_DUBLIN",
  SONGSARI: "SONGSARI",
};

export function getCivilCategoryIcon(code: string): OrgIconCode | undefined {
  return CIVIL_CATEGORY_ICON_MAP[code];
}

/** 외부 세력 산하 조직 code → OrgIconCode. lib/external-sub-orgs.ts 의 EXTERNAL_SUB_ORGS 중
 *  logoUrl 이미지가 없는 조직만 등재 (WHITE_ROSE/SPACE_ZERO 는 로고 이미지 우선). */
const EXTERNAL_SUB_ORG_ICON_MAP: Record<string, OrgIconCode> = {
  USA: "USA",
  RUSSIA: "RUSSIA",
  NOGA: "NOGA",
  GALLOGLA: "GALLOGLA",
  JOMSVIKING: "JOMSVIKING",
  GOLDEN_DAWN: "GOLDEN_DAWN",
  AHNENERBE: "AHNENERBE",
};

export function getExternalSubOrgIcon(code: string): OrgIconCode | undefined {
  return EXTERNAL_SUB_ORG_ICON_MAP[code];
}

const ICONS: Record<OrgIconCode, IconPath> = {
  ROOT: {
    body: `<rect x="8" y="3" width="8" height="5" rx="0.5"/><path d="M12 8v4"/><path d="M5 12h14"/><path d="M5 12v3M12 12v3M19 12v3"/><rect x="3" y="15" width="4" height="5" rx="0.5"/><rect x="10" y="15" width="4" height="5" rx="0.5"/><rect x="17" y="15" width="4" height="5" rx="0.5"/>`,
  },
  UNASSIGNED: {
    body: `<path d="M12 3L21 12 12 21 3 12z" stroke-dasharray="2.5 2"/><path d="M10 12h4M12 10v4"/>`,
  },
  PERSON: {
    body: `<rect x="4" y="3.5" width="16" height="17" rx="1"/><circle cx="12" cy="10" r="3"/><path d="M7 18c.7-2.5 2.7-4 5-4s4.3 1.5 5 4"/>`,
  },
  HQ: {
    body: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7l1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 15.2l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5L12 7z"/>`,
  },
  RESEARCH: {
    body: `<path d="M9 3h6"/><path d="M10 3.5v5.5L5.5 18.5a1.2 1.2 0 001 1.5h11a1.2 1.2 0 001-1.5L14 9V3.5"/><path d="M7.5 14h9"/><circle cx="10" cy="16.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="14" cy="17.7" r="0.6" fill="currentColor" stroke="none"/><circle cx="11.5" cy="18.5" r="0.5" fill="currentColor" stroke="none"/>`,
  },
  ADMIN_BUREAU: {
    body: `<rect x="5" y="4.5" width="14" height="16.5" rx="1"/><rect x="9" y="2.5" width="6" height="3.5" rx="0.5"/><path d="M8 11h8M8 14h8M8 17h5"/>`,
  },
  ARMORY_BUREAU: {
    /* 병기부 — 교차 화기 + 검. barrel IconArmory(ic_armory.svg)와 동일 도면. */
    body: `<path d="M5 19L20 4"/><path d="M19 3.4l1.6 1.6"/><path d="M14.1 9.9l1.5 2.7"/><path d="M8.3 17.7L5.1 20.9L5 19"/><path d="M16.2 16.2L4.8 4.8"/><path d="M14.6 17.8l3.2-3.2"/><path d="M17 17l1.8 1.8"/><circle cx="19.7" cy="19.7" r="0.55" fill="currentColor" stroke="none"/>`,
  },
  INTL: {
    body: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="6.5" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="17.5" cy="15" r="1.3" fill="currentColor" stroke="none"/><path d="M12 7.8L7.4 13.8M12 7.8L16.6 13.8M7.8 15h8.4"/>`,
  },
  CONTROL: {
    body: `<rect x="4" y="10" width="16" height="11" rx="1"/><path d="M8 10V7a4 4 0 018 0v3"/><path d="M4 14h16M4 17.5h16"/><path d="M9.3 10.5v10.5M14.7 10.5v10.5"/>`,
  },
  COUNCIL: {
    body: `<circle cx="12" cy="12" r="3.2"/><path d="M8.8 12h6.4"/><ellipse cx="12" cy="12" rx="1.3" ry="3.2"/><circle cx="12" cy="4" r="1.4"/><circle cx="12" cy="20" r="1.4"/><circle cx="4" cy="12" r="1.4"/><circle cx="20" cy="12" r="1.4"/>`,
  },
  MILITARY: {
    body: `<path d="M12 2.5l1.4 2.8 3.1.4-2.2 2.2.5 3.1L12 9.5l-2.8 1.5.5-3.1-2.2-2.2 3.1-.4L12 2.5z"/><path d="M4 16l8-4 8 4"/><path d="M4 21l8-4 8 4"/>`,
  },
  CIVIL: {
    body: `<circle cx="6" cy="8.5" r="2.3"/><path d="M2 17c0-2.4 1.7-4.2 4-4.2"/><circle cx="12" cy="7.5" r="2.8"/><path d="M7.7 18c0-2.8 1.9-4.7 4.3-4.7s4.3 1.9 4.3 4.7"/><circle cx="18" cy="8.5" r="2.3"/><path d="M22 17c0-2.4-1.7-4.2-4-4.2"/>`,
  },
  HOSTILE: {
    /* novus-icons v1 ID 23 — 교차 검. barrel IconHostile(ic_hostile.svg)과 동일 도면으로 통일. */
    body: `<path d="M5 4l11 11M14.2 16.8l3.6-3.6M16.9 15.9L19 18"/><path d="M19 4L8 15M9.8 16.8L6.2 13.2M7.1 15.9L5 18"/>`,
  },
  NOVUS_ORDO: {
    /* 본부 — UN 로고 모티프(중앙 십자+원+격자) 단순화. 본부의 지구·통할 상징. */
    body: `<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17"/><path d="M3.5 12h17"/><path d="M5.5 7.5h13"/><path d="M5.5 16.5h13"/><circle cx="12" cy="12" r="3"/>`,
  },
  SECRETARIAT: {
    body: `<rect x="5" y="3" width="14" height="18" rx="0.8"/><path d="M5 9h14"/><path d="M5 15h14"/><path d="M10 6h4"/><path d="M10 12h4"/><path d="M10 18h4"/>`,
  },
  FINANCE: {
    body: `<path d="M12 4v16"/><path d="M9 20h6"/><path d="M4 8h16"/><path d="M6 8v2.5"/><path d="M3 10.5a3 1.5 0 006 0"/><path d="M18 8v2.5"/><path d="M15 10.5a3 1.5 0 006 0"/>`,
  },
  MANUS: {
    /* 현장요원 모티프 — 우상단에서 좌하단으로 흐르는 주 라인 + 보조 라인 + 짧은 연결선. 침투·기동·집행의 동선 추상화. */
    body: `<path d="M21.1 0.64L17.49 4.16L15.79 2.77L15.79 6.08L12.69 9.17L10.03 8.85L6.93 12.05L7.57 13.87L2.13 19.31L6.19 23.36L9.07 16L10.45 19.52L12.27 18.88L11.73 16.21L13.44 14.51L14.19 13.12"/><path d="M16.43 8L13.87 11.52L15.57 13.12L18.13 14.29L16.75 16.96L14.08 15.47"/><path d="M8.96 12.37L12.05 9.28"/>`,
  },
  /* SECTOR_A~E — 다이아몬드 외곽 + 알파벳(NATO 음성기호) 모티프. MANUS 산하 5개 섹터 표식. */
  SECTOR_A: {
    body: `<path d="M12 3L21 12L12 21L3 12Z"/><path d="M9.5 16L12 9L14.5 16"/><path d="M10.7 13.5h2.6"/>`,
  },
  SECTOR_B: {
    body: `<path d="M12 3L21 12L12 21L3 12Z"/><path d="M10 9.5v7"/><path d="M10 9.5h2.5a1.75 1.75 0 010 3.5H10"/><path d="M10 13h2.5a1.75 1.75 0 010 3.5H10"/>`,
  },
  SECTOR_C: {
    body: `<path d="M12 3L21 12L12 21L3 12Z"/><path d="M14.5 11a3 3 0 100 4"/>`,
  },
  SECTOR_D: {
    body: `<path d="M12 3L21 12L12 21L3 12Z"/><path d="M10 9.5v7"/><path d="M10 9.5h2a3.5 3.5 0 010 7h-2"/>`,
  },
  SECTOR_E: {
    body: `<path d="M12 3L21 12L12 21L3 12Z"/><path d="M14 9.5h-4v7h4"/><path d="M10 13h3"/>`,
  },
  ALL: {
    body: `<rect x="3" y="3" width="8" height="8" rx="0.8"/><circle cx="7" cy="7" r="1.4"/><rect x="13" y="3" width="8" height="8" rx="0.8"/><circle cx="17" cy="7" r="1.4"/><rect x="3" y="13" width="8" height="8" rx="0.8"/><circle cx="7" cy="17" r="1.4"/><rect x="13" y="13" width="8" height="8" rx="0.8"/><circle cx="17" cy="17" r="1.4"/>`,
  },
  MAIN: {
    body: `<path d="M12 1.5l.8 1.65 1.8.25-1.3 1.25.3 1.8L12 5.6l-1.6.85.3-1.8-1.3-1.25 1.8-.25L12 1.5z" fill="currentColor" stroke="none"/><circle cx="12" cy="11.5" r="3.2"/><path d="M5 21c0-3.7 3.2-6.5 7-6.5s7 2.8 7 6.5"/>`,
  },
  MINI: {
    body: `<circle cx="9" cy="3.5" r="0.7" fill="currentColor" stroke="none"/><circle cx="12" cy="3.5" r="0.7" fill="currentColor" stroke="none"/><circle cx="15" cy="3.5" r="0.7" fill="currentColor" stroke="none"/><circle cx="12" cy="11.5" r="2.6"/><path d="M6.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5"/>`,
  },
  /* ── 시민사회 내부 분류 — mirror: org_civil_*.svg ── */
  NEON_VALKYRIE: {
    /* 발키리 엠블럼 — 왕관 쓴 발키리 측면 실루엣 + 흐르는 날개 라인 + 초승달 문양 원형 배지. */
    body: `<path d="M15 8.7C15.2 6 13.5 4.3 11.6 4.3 9.6 4.3 8.2 6.1 8.5 8.6L8.8 10.6"/><path d="M13.4 5.6L15.1 1.9L13.1 3.9L11.5 2.1L10.1 4.5L7.8 3.2L9.1 6.6z"/><path d="M15 8.7c.7.3 1 .9.7 1.3-.2.2-.2.4 0 .7.3.4.1.9-.4 1.1-.4.2-.9.2-1.4.1"/><path d="M8.8 10.6c-1.7.9-2.7 2.5-3 4.6"/><path d="M9.8 11.6c-1.1.6-1.9 1.6-2.3 3.1"/><path d="M6.8 20.5c.1-3.9 1.8-6.3 4.4-7.3"/><path d="M5.1 5.1L3.3 4.5L2.7 2.7L4.5 3.3Z"/><path d="M4.6 6.4l1.8-1.8"/><path d="M5.9 5.9L7.7 7.7"/><path d="M10.6 10.6L13.2 13.2"/><circle cx="17" cy="15.2" r="4.4"/><path d="M17.7 12.6Q13.6 15.2 17.7 17.8Q16.4 15.2 17.7 12.6z"/>`,
  },
  NEW_DUBLIN: {
    /* 도시 스카이라인 — 높낮이 다른 빌딩 3동 + 창문. */
    body: `<path d="M3 20.5h18"/><path d="M4.5 20.5v-9.7h3.6v9.7"/><path d="M10.3 20.5v-15h4.6v15"/><path d="M17.1 20.5v-8.2h2.9v8.2"/><path d="M12 8.3h1.2M12 11.3h1.2M12 14.3h1.2M5.9 13.5h.9M5.9 16.2h.9M18.1 15h.9"/>`,
  },
  SONGSARI: {
    /* 민간 탐정 — 셜록 실루엣: 디어스토커 캡 + 측면 얼굴 프로필 + 돋보기. */
    body: `<path d="M5.8 9.2C6.1 5.8 8.7 3.4 12 3.4s5.9 2.4 6.2 5.8"/><path d="M12 3.4V2.3"/><path d="M5.8 9.2c-1.2 0-2.3.5-3.1 1.4 1.1.5 2.2.6 3.3.4"/><path d="M18.2 9.2c1.2 0 2.3.5 3.1 1.4-1.1.5-2.2.6-3.3.4"/><path d="M18.3 10.9c0 .8-.2 1.5-.5 2.1l1.3.4-.7 1.1.5 1c-.6 1-1.6 1.6-2.9 1.7"/><path d="M5.9 11c.2 2.6 1.3 4.6 3.2 5.9"/><circle cx="11.6" cy="17.4" r="3.1"/><path d="M9.3 19.7l-3.2 2.6"/>`,
  },
  /* ── 외부 세력 산하 조직 — mirror: org_extorg_*.svg ── */
  USA: {
    /* 미국 — 물결치는 성조기: 깃대 + 장식 + 캔턴(별 4점) + 웨이브 스트라이프 3줄. */
    body: `<path d="M4.5 21.5V3.4"/><circle cx="4.5" cy="2.4" r="0.7" fill="currentColor" stroke="none"/><path d="M4.5 4.3c2.5 1 4.9 1 7.4.2 2.4-.8 4.9-.8 7.6.3v9.3c-2.7-1.1-5.2-1.1-7.6-.3-2.5.8-4.9.8-7.4-.2z"/><path d="M11.9 4.5v5.1"/><path d="M11.9 7.2c2.4-.8 4.9-.8 7.6.3"/><path d="M4.5 9.4c2.5 1 4.9 1 7.4.2 2.4-.8 4.9-.8 7.6.3"/><path d="M4.5 11.9c2.5 1 4.9 1 7.4.2 2.4-.8 4.9-.8 7.6.3"/><circle cx="6.4" cy="6.1" r="0.5" fill="currentColor" stroke="none"/><circle cx="8.6" cy="6.6" r="0.5" fill="currentColor" stroke="none"/><circle cx="6.4" cy="7.9" r="0.5" fill="currentColor" stroke="none"/><circle cx="8.6" cy="8.4" r="0.5" fill="currentColor" stroke="none"/>`,
  },
  RUSSIA: {
    /* 러시아 정부 — 깃대와 삼색기를 단색 조직도 문법으로 단순화. */
    body: `<path d="M4.5 21.5V3.4"/><circle cx="4.5" cy="2.4" r="0.7" fill="currentColor" stroke="none"/><path d="M4.5 4.3c2.5 1 4.9 1 7.4.2 2.4-.8 4.9-.8 7.6.3v9.3c-2.7-1.1-5.2-1.1-7.6-.3-2.5.8-4.9.8-7.4-.2z"/><path d="M4.5 7.4c2.5 1 4.9 1 7.4.2 2.4-.8 4.9-.8 7.6.3"/><path d="M4.5 10.5c2.5 1 4.9 1 7.4.2 2.4-.8 4.9-.8 7.6.3"/>`,
  },
  NOGA: {
    /* NOGA (Novus Ordo Great Again) — 군부(MILITARY) 도상에서 꺾쇠를 1단으로 줄인 파생형. 군부 계열 하위 조직 표식. */
    body: `<path d="M12 2.5l1.4 2.8 3.1.4-2.2 2.2.5 3.1L12 9.5l-2.8 1.5.5-3.1-2.2-2.2 3.1-.4L12 2.5z"/><path d="M4 16l8-4 8 4"/>`,
  },
  GALLOGLA: {
    /* 갈로글라 — 생성 원화를 단색 벡터로 정리한 켈트 매듭 스파스 전투 문장. */
    body: `<g transform="scale(.046875)" fill="currentColor" stroke="none"><path d="M0 0 C-0 2 -1 3 -1 5 C-4 29 -2 53 16 71 C32 83 46 85 65 80 C70 85 67 102 67 108 C67 112 67 115 67 119 C67 120 67 120 67 127 C64 128 64 128 59 126 C38 124 23 133 11 150 C-5 177 -2 204 10 232 C10 233 9 233 9 234 C-35 213 -67 175 -72 126 C-73 92 -48 0 0 0 Z " transform="translate(167,32)"/><path d="M0 0 C38 15 63 58 71 96 C76 145 58 189 19 218 C0 231 0 231 -10 234 C-8 229 -6 223 -4 218 C5 189 0 164 -18 140 C-33 127 -46 123 -66 128 C-68 123 -67 114 -67 109 C-67 106 -67 103 -67 100 C-67 91 -67 91 -66 81 C-62 80 -62 80 -54 83 C-36 84 -22 78 -10 65 C3 45 5 23 0 0 Z " transform="translate(345,32)"/><path d="M0 0 C4 5 8 11 12 16 C14 19 16 21 18 24 C17 25 17 27 16 28 C13 35 13 35 11 44 C3 44 -5 44 -13 44 C-13 43 -13 43 -14 38 C-16 32 -16 32 -20 26 C-17 21 -14 16 -10 11 C-9 9 -7 7 -6 5 C-2 0 -2 0 0 0 Z " transform="translate(257,37)"/><path d="M0 0 C4 0 8 0 12 0 C21 0 21 0 24 4 C25 6 25 6 25 16 C24 16 24 16 20 20 C14 30 16 48 16 60 C16 63 16 67 16 71 C16 80 16 80 22 86 C24 96 22 103 16 110 C16 116 16 121 16 127 C16 130 16 133 16 137 C16 140 16 143 16 147 C16 150 16 154 16 157 C16 166 16 174 16 182 C9 179 4 173 -2 168 C-6 164 -11 160 -15 156 C-19 149 -16 134 -16 126 C-15 110 -15 110 -22 102 C-25 92 -22 87 -16 78 C-15 59 -16 40 -18 20 C-19 20 -21 20 -22 20 C-25 16 -25 16 -25 6 C-18 -3 -10 -0 0 0 Z " transform="translate(256.0625,85.5)"/><path d="M0 0 C25 14 43 34 44 63 C43 88 29 105 13 123 C11 126 8 128 6 131 C3 134 1 136 -2 139 C-10 133 -10 133 -18 126 C-12 118 -12 118 -5 111 C21 79 21 79 20 56 C16 46 13 39 5 33 C-3 23 -1 12 0 0 Z " transform="translate(278,200)"/><path d="M0 0 C0 5 0 9 0 14 C1 16 1 19 1 21 C0 28 0 28 -8 35 C-19 50 -23 61 -18 79 C-15 85 -15 85 -12 89 C-14 96 -19 100 -24 105 C-24 106 -25 106 -25 107 C-37 101 -42 84 -44 72 C-45 51 -29 0 0 0 Z " transform="translate(234,201)"/><path d="M0 0 C8 5 14 12 21 18 C28 24 34 30 41 36 C45 40 49 43 53 47 C49 54 45 59 40 65 C33 62 30 58 25 53 C19 47 13 42 7 36 C3 32 -0 29 -4 25 C-6 23 -8 22 -10 20 C-9 12 -5 6 0 0 Z " transform="translate(230,241)"/><path d="M0 0 C6 3 11 8 16 13 C16 20 9 24 4 29 C-7 42 -14 52 -13 69 C-9 79 -9 79 -3 88 C-2 96 -3 104 -3 112 C-20 103 -30 90 -35 71 C-36 37 -23 23 0 0 Z " transform="translate(237,287)"/><path d="M0 0 C11 14 10 35 4 51 C-3 65 -11 73 -24 81 C-24 81 -25 81 -25 81 C-26 56 -26 56 -18 47 C-14 37 -14 28 -16 18 C-13 14 -9 11 -6 7 C-4 5 -2 2 0 0 Z " transform="translate(303,318)"/><path d="M0 0 C6 1 9 6 13 10 C16 12 18 15 21 17 C22 18 22 18 28 23 C34 29 34 29 38 32 C37 41 33 46 27 52 C25 51 24 49 22 48 C18 44 15 41 11 38 C3 31 -4 24 -11 17 C-9 12 -9 12 -2 3 C-1 2 -1 1 0 0 Z " transform="translate(244,321)"/><path d="M0 0 C6 3 9 7 14 11 C22 18 22 18 28 21 C35 31 33 42 32 53 C33 54 35 54 36 55 C38 60 37 67 37 72 C36 73 34 75 33 76 C35 78 37 81 39 83 C43 92 43 96 39 105 C36 108 32 111 29 114 C27 117 24 119 22 122 C17 125 17 125 12 123 C5 117 5 117 3 112 C1 111 -0 111 -2 110 C-9 101 -10 99 -9 88 C-3 78 -3 78 -1 75 C-2 74 -4 72 -5 71 C-6 58 -6 58 0 52 C0 43 0 35 0 26 C0 23 0 21 0 18 C0 12 0 6 0 0 Z " transform="translate(240,355)"/></g>`,
  },
  JOMSVIKING: {
    /* 욤스비킹 — 생성 원화를 단색 벡터로 정리한 방패열 용두 장선 문장. */
    body: `<g transform="scale(.046875)" fill="currentColor" stroke="none"><path d="M0 0 C9 6 8 5 8 17 C7 18 6 20 5 21 C5 26 4 31 4 36 C4 38 4 41 4 44 C4 46 4 48 4 50 C7 50 11 51 14 51 C27 53 39 56 52 59 C55 60 58 60 61 61 C63 61 66 62 69 63 C71 63 73 64 76 64 C96 71 103 107 107 126 C116 171 107 220 79 256 C73 254 68 252 62 250 C44 244 26 242 7 240 C6 240 5 239 4 239 C4 248 4 256 4 265 C-1 266 -7 267 -12 268 C-12 259 -13 250 -13 240 C-44 242 -72 247 -101 258 C-100 254 -100 254 -96 247 C-61 189 -60 119 -88 58 C-93 50 -98 42 -103 34 C-91 34 -80 35 -68 37 C-66 38 -64 38 -61 38 C-45 41 -28 43 -12 46 C-12 42 -12 38 -12 34 C-12 32 -12 30 -12 28 C-13 22 -13 22 -17 16 C-17 3 -12 0 0 0 Z " transform="translate(229,63)"/><path d="M0 0 C3 3 3 3 9 13 C19 27 32 32 48 39 C61 45 68 52 74 65 C74 66 74 66 74 67 C76 68 77 68 79 69 C93 78 93 78 93 90 C89 98 86 105 79 110 C78 110 78 110 77 110 C76 107 75 103 74 100 C68 93 68 93 56 93 C57 101 59 104 67 108 C66 112 66 112 59 118 C57 118 56 119 54 119 C53 117 53 115 52 114 C46 101 40 95 26 93 C22 96 22 96 21 104 C24 116 29 125 35 136 C57 171 57 211 38 248 C34 253 31 259 26 264 C25 266 23 267 22 269 C-7 300 -49 313 -90 319 C-92 319 -94 320 -96 320 C-130 324 -165 324 -199 319 C-201 319 -203 318 -205 318 C-266 309 -324 281 -349 222 C-359 189 -358 157 -334 131 C-324 122 -324 122 -319 122 C-321 128 -321 128 -324 134 C-332 154 -328 173 -318 192 C-305 209 -291 216 -270 223 C-269 226 -269 226 -270 230 C-271 248 -267 259 -253 271 C-238 278 -229 279 -213 273 C-205 267 -199 262 -195 253 C-193 255 -193 255 -189 265 C-187 267 -186 269 -184 271 C-184 272 -184 272 -184 273 C-183 274 -181 274 -180 275 C-178 276 -177 278 -175 279 C-161 285 -150 286 -135 280 C-124 272 -119 265 -114 253 C-111 257 -108 261 -105 265 C-91 276 -79 279 -63 274 C-46 265 -40 254 -38 236 C-39 230 -40 224 -41 218 C-39 217 -37 216 -35 215 C-14 203 -2 183 -0 158 C-2 141 -8 127 -14 111 C-17 94 -14 83 -5 69 C-13 70 -13 70 -23 75 C-24 75 -24 75 -27 77 C-24 57 -8 49 9 42 C8 41 8 41 6 37 C-1 26 -5 13 0 0 Z M34 53 C35 66 35 66 42 69 C52 69 52 69 56 67 C52 59 43 56 34 53 Z " transform="translate(387,126)"/><path d="M0 0 C9 10 12 18 11 31 C6 45 1 52 -13 57 C-30 59 -38 55 -49 42 C-54 28 -55 18 -46 5 C-31 -10 -18 -11 0 0 Z " transform="translate(331,338)"/><path d="M0 0 C7 13 7 22 1 36 C-9 49 -18 53 -34 51 C-45 46 -55 40 -58 27 C-59 9 -56 -1 -40 -11 C-24 -16 -12 -12 0 0 Z " transform="translate(182,345)"/><path d="M0 0 C9 15 11 25 4 41 C-6 55 -16 59 -33 57 C-47 51 -56 44 -59 28 C-59 12 -54 4 -42 -6 C-25 -13 -15 -11 0 0 Z " transform="translate(258,346)"/></g>`,
  },
  GOLDEN_DAWN: {
    /* 황금여명회 — 지평선 위로 떠오르는 황금 여명(반원 태양 + 광선) 컬트 문장. */
    body: `<path d="M3 16.5h18"/><path d="M7.5 16.5a4.5 4.5 0 019 0"/><circle cx="12" cy="14.4" r="0.7" fill="currentColor" stroke="none"/><path d="M12 9.8V6.8"/><path d="M8.1 11.4L6 9.3"/><path d="M15.9 11.4L18 9.3"/><path d="M5.6 14.6l-2.8-.8"/><path d="M18.4 14.6l2.8-.8"/><path d="M6.5 19.5h11"/>`,
  },
  AHNENERBE: {
    /* 아넨에르베 "광명회" — 일루미나티 문장: 피라미드 + 전시안(全視眼). */
    body: `<path d="M12 3.8L21 19H3z"/><path d="M8.9 14c.9-1.4 2-2.1 3.1-2.1s2.2.7 3.1 2.1c-.9 1.4-2 2.1-3.1 2.1S9.8 15.4 8.9 14z"/><circle cx="12" cy="14" r="0.8" fill="currentColor" stroke="none"/><path d="M12 3.8V1.8"/>`,
  },
};

interface Props {
  code: OrgIconCode;
  /** 픽셀 사이즈. 기본 16. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export default function OrgIcon({
  code,
  size = 16,
  className,
  style,
}: Props) {
  const icon = ICONS[code];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={true}
      // path 데이터를 그대로 주입. 정적 매핑(ICONS)만 들어가며 외부 입력 경로 없음.
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
