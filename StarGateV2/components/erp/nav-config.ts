/**
 * ERP 사이드바 / Command-K 공용 네비게이션 정의.
 *
 * `href` 가 null 이거나 `preparing` 이 true면 "준비중" 메뉴다.
 * `gmHref` 가 있으면 GM만 해당 준비중 페이지를 열어볼 수 있다.
 */

import type { IconComponent } from "@/components/icons";
import {
  IconAccount,
  IconApply,
  IconArmory,
  IconArmoryAcheron,
  IconArmoryLab,
  IconArmoryStrategic,
  IconArmoryTowaski,
  IconArmoryTraining,
  IconArmoryWorkshop,
  IconCoreArchive,
  IconCredit,
  IconCrown,
  IconDashboard,
  IconFactionMap,
  IconGallery,
  IconInventory,
  IconMembers,
  IconNotification,
  IconPersonCard,
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

import {
  flattenLockableNavItems,
  getPageLockKey,
  isPageLocked,
  isResolvedPageLocked,
  resolvePageLockItem,
  type ErpPageLockOverrides,
} from "@/lib/erp/page-lock-policy";

export interface NavItem {
  /** 사이드바 렌더용 한국어 라벨. */
  label: string;
  /** 영어 키워드. Command-K 부가 필터용. */
  keywords?: string;
  /** SVG 아이콘 컴포넌트. */
  icon: IconComponent;
  /** 활성 경로. null 이면 "준비중". */
  href: string | null;
  /** 준비중 메뉴를 GM에게만 열어줄 내부 경로. */
  gmHref?: string;
  /** 상세 경로까지 묶는 운영 잠금 식별자. 기본값은 gmHref 또는 href. */
  lockKey?: string;
  /** 링크가 열려 있어도 메뉴에 "준비중" 상태를 표시한다. */
  preparing?: boolean;
  /** 이 메뉴를 보기 위해 필요한 최소 역할. */
  minRole?: UserRole;
  /** 활성화 시 사이드바에 표시할 하위 메뉴. */
  children?: NavItem[];
}

export interface NavGroup {
  key: string;
  label: string;
  /** 그룹 전체를 감출 최소 역할 (예: "관리" 는 GM 전용). */
  minRole?: UserRole;
  items: NavItem[];
}

export function isPreparingNavItem(item: NavItem): boolean {
  return isPageLocked(item);
}

export function getNavItemLockKey(item: NavItem): string | null {
  return getPageLockKey(item);
}

export function isNavItemLocked(
  item: NavItem,
  overrides?: ErpPageLockOverrides,
): boolean {
  const lockKey = getNavItemLockKey(item);
  return isPageLocked(
    item,
    lockKey ? overrides?.[lockKey] : undefined,
  );
}

export function getNavItemHref(
  item: NavItem,
  role?: UserRole | null,
  overrides?: ErpPageLockOverrides,
): string | null {
  if (role === "GM" && item.gmHref) return item.gmHref;
  if (role !== "GM" && isNavItemLocked(item, overrides)) return null;
  if (item.href !== null) return item.href;
  return item.gmHref ?? null;
}

export function getNavItemActiveHrefs(item: NavItem): string[] {
  const ownHrefs = [item.href, item.gmHref].filter(
    (href): href is string => href !== null && href !== undefined,
  );
  const childHrefs = item.children?.flatMap(getNavItemActiveHrefs) ?? [];
  return [...ownHrefs, ...childHrefs];
}

export function getAllNavItems(): NavItem[] {
  return flattenLockableNavItems(
    NAV_GROUPS.flatMap((group) => group.items),
  ) as NavItem[];
}

export function findNavItemByLockKey(lockKey: string): NavItem | null {
  return (
    getAllNavItems().find((item) => getNavItemLockKey(item) === lockKey) ?? null
  );
}

export function resolveNavItemForPath(pathname: string): NavItem | null {
  return resolvePageLockItem(
    NAV_GROUPS.flatMap((group) => group.items),
    pathname,
  ) as NavItem | null;
}

export function isNavPathLocked(
  pathname: string,
  overrides?: ErpPageLockOverrides,
): boolean {
  return isResolvedPageLocked(
    NAV_GROUPS.flatMap((group) => group.items),
    pathname,
    overrides,
  );
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "me",
    label: "내 정보",
    items: [
      { label: "대시보드", keywords: "dashboard", icon: IconDashboard, href: "/erp" },
      { label: "계정", keywords: "account password discord settings", icon: IconAccount, href: "/erp/account" },
      { label: "알림", keywords: "notifications", icon: IconNotification, href: "/erp/notifications" },
    ],
  },
  {
    key: "activity",
    label: "활동",
    items: [
      { label: "세션", keywords: "sessions", icon: IconSession, href: "/erp/sessions" },
      /* 미션 보드 — 콘텐츠 준비중 (page.tsx 는 placeholder). */
      { label: "미션 보드", keywords: "missions", icon: IconApply, href: null, gmHref: "/erp/missions" },
    ],
  },
  {
    key: "people",
    label: "인물·조직",
    items: [
      { label: "캐릭터", keywords: "characters person", icon: IconPersonCard, href: "/erp/characters" },
      { label: "신원조회", keywords: "identity personnel", icon: IconMembers, href: "/erp/personnel" },
      { label: "세력도", keywords: "factions diplomacy influence 세력 관계도 외교", icon: IconFactionMap, href: null, gmHref: "/erp/factions" },
      /* 명예의 전당 — 콘텐츠 준비중. */
      { label: "명예의 전당", keywords: "hall of fame", icon: IconCrown, href: null, gmHref: "/erp/hall-of-fame" },
    ],
  },
  {
    key: "assets",
    label: "자산",
    items: [
      { label: "인벤토리", keywords: "inventory equipment gear weapon armor items 장비", icon: IconInventory, href: "/erp/inventory" },
      { label: "크레딧", keywords: "credits", icon: IconCredit, href: "/erp/credits" },
      /* 편의점 · 주식 — M1 stub. M2/M3 에서 본 구현 활성화. */
      { label: "편의점", keywords: "shop convenience store consumable 소모품 편의점", icon: IconShop, href: "/erp/shop" },
      {
        label: "병기부",
        keywords:
          "equipment shop armory arsenal weapon armor gear forge simulator strategic custom 병기부 무기 방어구 토와스키 아케론 대장간 시뮬레이터 전략 전용무기",
        icon: IconArmory,
        href: "/erp/equipment-shop/towaski",
        gmHref: "/erp/equipment-shop",
        preparing: true,
        children: [
          {
            label: "신체증강 연구소",
            keywords: "research lab enhancement stat 강화 연구소",
            icon: IconArmoryLab,
            href: null,
            gmHref: "/erp/equipment-shop/lab",
          },
          {
            label: "토와스키 건샵",
            keywords: "towaski weapon armor 장비 무기 방어구",
            icon: IconArmoryTowaski,
            href: "/erp/equipment-shop/towaski",
            gmHref: "/erp/equipment-shop/towaski",
          },
          {
            label: "아케론 대장간",
            keywords: "acheron forge melee cold weapon 대장간 냉병기 근접무기 아케론",
            icon: IconArmoryAcheron,
            href: null,
            gmHref: "/erp/equipment-shop/acheron",
          },
          {
            label: "전략 장비 보급소",
            keywords: "strategic assets vehicle support 전략자산 차량 전투보조",
            icon: IconArmoryStrategic,
            href: null,
            gmHref: "/erp/equipment-shop/strategic",
          },
          {
            label: "공방",
            keywords: "custom weapon workshop crafting 공방",
            icon: IconArmoryWorkshop,
            href: null,
            gmHref: "/erp/equipment-shop/custom",
          },
          {
            label: "훈련장",
            keywords: "equipment simulator test range weapon test 훈련장 시험장",
            icon: IconArmoryTraining,
            href: null,
            gmHref: "/erp/equipment-shop/simulator",
          },
        ],
      },
      { label: "주식", keywords: "stock market 주식 증권", icon: IconStock, href: "/erp/stock" },
    ],
  },
  {
    key: "library",
    label: "자료실",
    items: [
      { label: "위키", keywords: "wiki", icon: IconWiki, href: "/erp/wiki" },
      { label: "작전 보고서", keywords: "report session archive operation 작전 보고서 세션 리포트 작전 기록", icon: IconReportDocument, href: "/erp/sessions/report" },
      { label: "기록보관소", keywords: "catalog archive records equipment weapon armor consumable material sample evidence special 기록보관소 장비 소모품 샘플 물증 특수", icon: IconCoreArchive, href: "/erp/wiki/catalog/all", lockKey: "/erp/wiki/catalog" },
      /* 갤러리 · 연대기 — 콘텐츠 준비중. */
      { label: "갤러리", keywords: "gallery", icon: IconGallery, href: null, gmHref: "/erp/gallery" },
      { label: "연대기", keywords: "chronicle", icon: IconWorld, href: null, gmHref: "/erp/chronicle" },
    ],
  },
  {
    key: "admin",
    label: "관리 · GM 전용",
    minRole: "GM",
    items: [
      /* 관리자 대시보드 — 콘텐츠 준비중. 계정 메뉴(IconSystem)와 시각 충돌 회피 위해 IconCrown 사용. */
      { label: "관리자", keywords: "admin", icon: IconCrown, href: null, gmHref: "/erp/admin" },
      { label: "사용자 관리", keywords: "users admin", icon: IconUserAdmin, href: "/erp/admin/users" },
      { label: "크레딧 운영", keywords: "credits admin grant op pool 작전풀", icon: IconCredit, href: "/erp/admin/credits" },
      { label: "주식 운영", keywords: "stocks admin market price 주식 시세", icon: IconStock, href: "/erp/admin/stocks" },
      { label: "대사 비프 테스트", keywords: "dialogue beep audio npc hud undertale", icon: IconSystem, href: "/erp/admin/dialogue-beep" },
      { label: "인벤토리 운영", keywords: "inventory admin grant items 지급 마스터", icon: IconInventory, href: "/erp/admin/inventory" },
      { label: "캐릭터 등록", keywords: "character person register import", icon: IconPersonCard, href: "/erp/admin/characters/import" },
    ],
  },
];
