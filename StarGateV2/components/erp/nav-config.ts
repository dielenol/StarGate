/**
 * ERP 사이드바 / Command-K 공용 네비게이션 정의.
 *
 * `href` 가 null 이면 아직 라우트가 준비되지 않은 메뉴 — 사이드바에서는 "준비중"
 * 배지와 함께 비활성 렌더, Command-K 에서는 클릭해도 push 되지 않는다.
 */

import type { IconComponent } from "@/components/icons";
import {
  IconApply,
  IconArchive,
  IconCharacter,
  IconCredit,
  IconCrown,
  IconDashboard,
  IconEquipment,
  IconMembers,
  IconNotification,
  IconProfile,
  IconSession,
  IconSystem,
  IconUserAdmin,
  IconWiki,
  IconWorld,
} from "@/components/icons";

import type { UserRole } from "@/types/user";

export interface NavItem {
  /** 사이드바 렌더용 한국어 라벨. */
  label: string;
  /** 영어 키워드. Command-K 부가 필터용. */
  keywords?: string;
  /** SVG 아이콘 컴포넌트. */
  icon: IconComponent;
  /** 활성 경로. null 이면 "준비중". */
  href: string | null;
  /** 이 메뉴를 보기 위해 필요한 최소 역할. */
  minRole?: UserRole;
}

export interface NavGroup {
  key: string;
  label: string;
  /** 그룹 전체를 감출 최소 역할 (예: "관리" 는 GM 전용). */
  minRole?: UserRole;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "me",
    label: "내 정보",
    items: [
      { label: "대시보드", keywords: "dashboard", icon: IconDashboard, href: "/erp" },
      { label: "프로필", keywords: "profile character", icon: IconProfile, href: "/erp/profile" },
      { label: "계정", keywords: "account password discord settings", icon: IconSystem, href: "/erp/account" },
      { label: "알림", keywords: "notifications", icon: IconNotification, href: "/erp/notifications" },
    ],
  },
  {
    key: "activity",
    label: "활동",
    items: [
      { label: "세션", keywords: "sessions", icon: IconSession, href: "/erp/sessions" },
      /* 미션 보드 — 콘텐츠 준비중 (page.tsx 는 placeholder). */
      { label: "미션 보드", keywords: "missions", icon: IconApply, href: null },
    ],
  },
  {
    key: "people",
    label: "인물·조직",
    items: [
      { label: "캐릭터", keywords: "characters", icon: IconCharacter, href: "/erp/characters" },
      { label: "캐릭터 인입", keywords: "character import", icon: IconCharacter, href: "/erp/admin/characters/import", minRole: "V" },
      { label: "신원조회", keywords: "identity personnel", icon: IconMembers, href: "/erp/personnel" },
      /* 명예의 전당 — 콘텐츠 준비중. */
      { label: "명예의 전당", keywords: "hall of fame", icon: IconCrown, href: null },
    ],
  },
  {
    key: "assets",
    label: "자산",
    items: [
      { label: "장비", keywords: "equipment inventory", icon: IconEquipment, href: "/erp/inventory" },
      { label: "크레딧", keywords: "credits", icon: IconCredit, href: "/erp/credits" },
    ],
  },
  {
    key: "library",
    label: "자료실",
    items: [
      { label: "위키", keywords: "wiki", icon: IconWiki, href: "/erp/wiki" },
      /* 갤러리 · 연대기 — 콘텐츠 준비중. */
      { label: "갤러리", keywords: "gallery", icon: IconArchive, href: null },
      { label: "연대기", keywords: "chronicle", icon: IconWorld, href: null },
    ],
  },
  {
    key: "admin",
    label: "관리 · GM 전용",
    minRole: "GM",
    items: [
      /* 관리자 대시보드 — 콘텐츠 준비중. 계정 메뉴(IconSystem)와 시각 충돌 회피 위해 IconCrown 사용. */
      { label: "관리자", keywords: "admin", icon: IconCrown, href: null },
      { label: "사용자 관리", keywords: "users admin", icon: IconUserAdmin, href: "/erp/admin/users" },
    ],
  },
];
