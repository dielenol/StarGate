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
  | "MINI";

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
    // 병기부는 별도 도상이 확정될 때까지 의도적으로 빈 칸으로 둔다.
    body: ``,
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
