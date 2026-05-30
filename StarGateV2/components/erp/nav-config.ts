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
  IconConsumable,
  IconCredit,
  IconCrown,
  IconDashboard,
  IconEquipment,
  IconInventory,
  IconMembers,
  IconNotification,
  IconReportDocument,
  IconSession,
  IconShop,
  IconStock,
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
      { label: "계정", keywords: "account password discord settings", icon: IconSystem, href: "/erp/account" },
      /* 알림 — 콘텐츠 준비중. */
      { label: "알림", keywords: "notifications", icon: IconNotification, href: null },
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
      { label: "신원조회", keywords: "identity personnel", icon: IconMembers, href: "/erp/personnel" },
      /* 명예의 전당 — 콘텐츠 준비중. */
      { label: "명예의 전당", keywords: "hall of fame", icon: IconCrown, href: null },
    ],
  },
  {
    key: "assets",
    label: "자산",
    items: [
      { label: "장비 인벤토리", keywords: "inventory equipment gear weapon armor items 장비", icon: IconInventory, href: "/erp/inventory" },
      { label: "크레딧", keywords: "credits", icon: IconCredit, href: "/erp/credits" },
      /* 편의점 · 주식 — M1 stub. M2/M3 에서 본 구현 활성화. */
      { label: "편의점", keywords: "shop convenience store consumable 소모품 편의점", icon: IconShop, href: "/erp/shop" },
      { label: "주식", keywords: "stock market 주식 증권", icon: IconStock, href: "/erp/stock" },
    ],
  },
  {
    key: "library",
    label: "자료실",
    items: [
      { label: "위키", keywords: "wiki", icon: IconWiki, href: "/erp/wiki" },
      { label: "작전 보고서", keywords: "report session archive operation 작전 보고서 세션 리포트 작전 기록", icon: IconReportDocument, href: "/erp/sessions/report" },
      { label: "장비 카탈로그", keywords: "catalog equipment weapon armor 장비", icon: IconEquipment, href: "/erp/wiki/catalog/equipment" },
      { label: "소모품 카탈로그", keywords: "catalog consumable potion 소모품", icon: IconConsumable, href: "/erp/wiki/catalog/consumable" },
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
      { label: "크레딧 운영", keywords: "credits admin grant op pool 작전풀", icon: IconCredit, href: "/erp/admin/credits" },
      { label: "주식 운영", keywords: "stocks admin market price 주식 시세", icon: IconStock, href: "/erp/admin/stocks" },
      { label: "대사 비프 테스트", keywords: "dialogue beep audio npc hud undertale", icon: IconSystem, href: "/erp/admin/dialogue-beep" },
      { label: "인벤토리 운영", keywords: "inventory admin grant items 지급 마스터", icon: IconEquipment, href: "/erp/admin/inventory" },
      { label: "캐릭터 등록", keywords: "character register import", icon: IconCharacter, href: "/erp/admin/characters/import" },
    ],
  },
];
