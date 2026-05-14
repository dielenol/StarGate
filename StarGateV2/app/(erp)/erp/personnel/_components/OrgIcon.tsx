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
  | "INTL"
  | "CONTROL"
  | "FINANCE"
  // MANUS 산하 섹터 sub-unit
  | "SECTOR_A"
  | "SECTOR_B"
  | "SECTOR_C"
  | "SECTOR_D"
  | "SECTOR_E"
  // 외부 기관 (Faction)
  | "COUNCIL"
  | "MILITARY"
  | "CIVIL"
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
  SECRETARIAT: {
    body: `<rect x="5" y="3" width="14" height="18" rx="0.8"/><path d="M5 9h14"/><path d="M5 15h14"/><path d="M10 6h4"/><path d="M10 12h4"/><path d="M10 18h4"/>`,
  },
  FINANCE: {
    body: `<path d="M12 4v16"/><path d="M9 20h6"/><path d="M4 8h16"/><path d="M6 8v2.5"/><path d="M3 10.5a3 1.5 0 006 0"/><path d="M18 8v2.5"/><path d="M15 10.5a3 1.5 0 006 0"/>`,
  },
  MANUS: {
    /* 라틴 "손". 네 손가락+엄지로 펼친 손바닥 모티프 — 현장 집행을 상징. */
    body: `<path d="M12 21V11"/><path d="M9 21V8.5a1.5 1.5 0 013 0V11"/><path d="M15 21V8.5a1.5 1.5 0 00-3 0"/><path d="M9 10V5a1.5 1.5 0 013 0v6"/><path d="M15 10.5V6.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6"/><path d="M6 13.5V10a1.5 1.5 0 013 0"/>`,
  },
  /* SECTOR_A~E — 사각형 외곽 + 알파벳 모티프. MANUS 산하 5개 섹터 표식. */
  SECTOR_A: {
    body: `<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9 16l3-8 3 8"/><path d="M10 13h4"/>`,
  },
  SECTOR_B: {
    body: `<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9 7v10h3.5a2.5 2.5 0 000-5H9"/><path d="M9 12h3.5a2.5 2.5 0 010 5"/>`,
  },
  SECTOR_C: {
    body: `<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M15 9a4 4 0 100 6"/>`,
  },
  SECTOR_D: {
    body: `<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9 7v10h3a4 4 0 000-10H9z"/>`,
  },
  SECTOR_E: {
    body: `<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M15 7H9v10h6"/><path d="M9 12h5"/>`,
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
