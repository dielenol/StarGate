import type { CSSProperties } from "react";

/**
 * 조직도 add-on 아이콘 세트 (NOVUS Icon Set — Organization Add-on, 16 entries).
 *
 * - viewBox 24×24, stroke 1.5, currentColor.
 * - **Source of truth = 아래 ICONS map 의 inline path**.
 *   `/public/assets/svg/org_*.svg` 의 동일본은 외부 도구 / 디자이너 공유용 mirror 이며,
 *   디자이너가 SVG 만 수정해도 컴포넌트는 따라가지 않는다. **변경 시 양쪽 모두 동기화 필수**.
 * - inline path 매핑으로 React 단에서 렌더 (CSS color 컨트롤 + zero network).
 */

export type OrgIconCode =
  | "ROOT"
  | "UNASSIGNED"
  | "PERSON"
  | "HQ"
  | "RESEARCH"
  | "ADMIN_BUREAU"
  | "INTL"
  | "CONTROL"
  // 세력 (Faction)
  | "COUNCIL"
  | "MILITARY"
  | "CIVIL"
  // 독립기관 (Institution)
  | "SECRETARIAT"
  | "FINANCE"
  // 캐릭터 분류 (Tier scope)
  | "ALL"
  | "MAIN"
  | "MINI";

type IconPath = {
  /** path / shape 노드 raw markup. <svg> wrapper 는 컴포넌트가 추가. */
  body: string;
};

/** Sub-unit code → OrgIconCode 매핑 (조직 구조 sub-unit 식별자 그대로 매핑). */
export const SUBUNIT_ICON_MAP: Record<string, OrgIconCode> = {
  HQ: "HQ",
  RESEARCH: "RESEARCH",
  ADMIN_BUREAU: "ADMIN_BUREAU",
  INTL: "INTL",
  CONTROL: "CONTROL",
};

/** Faction code → OrgIconCode 매핑. shared-db FACTIONS code 와 동일한 키. */
export const FACTION_ICON_MAP: Record<string, OrgIconCode> = {
  COUNCIL: "COUNCIL",
  MILITARY: "MILITARY",
  CIVIL: "CIVIL",
};

/** Institution code → OrgIconCode 매핑. shared-db INSTITUTIONS code 와 동일한 키. */
export const INSTITUTION_ICON_MAP: Record<string, OrgIconCode> = {
  SECRETARIAT: "SECRETARIAT",
  FINANCE: "FINANCE",
};

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
