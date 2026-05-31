/**
 * 편의점(shop) 카탈로그 — tia_bot `SHOP_ITEMS` 의 TS 포팅.
 *
 * 출처: `tia_bot/shop.py:213-253` (SHOP_ITEMS) + `tia_bot/shop.py:686-691` (SHOP_PAGES).
 *
 * - slug 는 tia_bot 의 item id 와 1:1 매칭 (DB master_items.slug 와도 동일).
 * - color 는 tia_bot 의 RGB tuple 을 #RRGGBB 로 변환.
 * - pageGroup 은 SHOP_PAGES 분류와 정합 (BASIC / RECOVERY / LUXURY / RARE).
 * - stockMin / stockMax / appearRate 는 일자별 재고 시드 룰 (M2/M3 에서 활용).
 * - isShopOpen() 은 KST 20시 이후 + 일요일 종일 마감 룰을 따른다.
 */

import type { ShopPageGroup } from "@stargate/shared-db/types";

/* ── 상수 ── */

/** 마감 시각 (KST 20 시). */
const CLOSE_HOUR_KST = 20;

/** Asia/Seoul 타임존 ID. */
const KST_TIMEZONE = "Asia/Seoul";

/* ── Interface ── */

export interface ShopCatalogItem {
  slug: string;
  name: string;
  icon: string;
  price: number;
  effect: string;
  description: string;
  stockMin: number;
  stockMax: number;
  /** 0.0 ~ 1.0. 0 이면 항상 품절(VF혈액팩 같은 fluff). */
  appearRate: number;
  /** #RRGGBB. */
  color: string;
  pageGroup: ShopPageGroup;
}

/* ── Catalog ── */

export const SHOP_CATALOG: ShopCatalogItem[] = [
  {
    slug: "cup_ramen",
    name: "컵라면",
    icon: "🍜",
    price: 12,
    effect: "HP 5 회복",
    description: "따뜻한 국물이 마음까지 녹여주는 야전의 벗.",
    stockMin: 8,
    stockMax: 16,
    appearRate: 0.99,
    color: "#2a8b4c",
    pageGroup: "BASIC",
  },
  {
    slug: "soda",
    name: "소다",
    icon: "🥤",
    price: 12,
    effect: "SAN 5 회복",
    description: "톡 쏘는 탄산이 정신을 맑게 해줘요.",
    stockMin: 8,
    stockMax: 16,
    appearRate: 0.99,
    color: "#3068b0",
    pageGroup: "BASIC",
  },
  {
    slug: "coffee",
    name: "커피",
    icon: "☕",
    price: 30,
    effect: "카페인 1턴",
    description: "쓴맛이 정신을 깨워줘요... 저도 좋아해요.",
    stockMin: 6,
    stockMax: 12,
    appearRate: 0.92,
    color: "#785032",
    pageGroup: "BASIC",
  },
  {
    slug: "first_aid_patch",
    name: "응급 패치",
    icon: "🩹",
    price: 70,
    effect: "HP 15 회복",
    description: "찢어진 살갗과 떨리는 손을 빠르게 붙잡아주는 소형 응급 패치.",
    stockMin: 3,
    stockMax: 7,
    appearRate: 0.78,
    color: "#d95f5f",
    pageGroup: "RECOVERY",
  },
  {
    slug: "calm_mint",
    name: "진정 민트",
    icon: "🌿",
    price: 70,
    effect: "SAN 12 회복",
    description: "입안에 남는 박하 향이 호흡과 사고를 천천히 되돌려준다.",
    stockMin: 3,
    stockMax: 7,
    appearRate: 0.76,
    color: "#5ea68c",
    pageGroup: "RECOVERY",
  },
  {
    slug: "field_nutrition_gel",
    name: "야전 영양젤",
    icon: "🧃",
    price: 45,
    effect: "HP 10 / SAN 5",
    description: "짠맛과 단맛이 묘하게 섞인 휴대용 영양젤. 야전에서 몸과 정신을 동시에 끌어올린다.",
    stockMin: 5,
    stockMax: 10,
    appearRate: 0.88,
    color: "#c9a04c",
    pageGroup: "RECOVERY",
  },
  {
    slug: "energy_bar",
    name: "에너지바",
    icon: "🍫",
    price: 50,
    effect: "탈진 해제",
    description: "한 입이면 다시 일어설 수 있어요.",
    stockMin: 4,
    stockMax: 8,
    appearRate: 0.85,
    color: "#2a8b4c",
    pageGroup: "RECOVERY",
  },
  {
    slug: "hotpack",
    name: "핫팩",
    icon: "🔥",
    price: 45,
    effect: "동상 해제",
    description: "손이 시려울 때 딱이에요... 따뜻해요.",
    stockMin: 4,
    stockMax: 8,
    appearRate: 0.88,
    color: "#c8503c",
    pageGroup: "RECOVERY",
  },
  {
    slug: "chocolate",
    name: "고급 초콜렛",
    icon: "🍬",
    price: 60,
    effect: "절망 1턴 무효",
    description: "달콤함이 절망을 잠시 잊게 해줘요.",
    stockMin: 3,
    stockMax: 6,
    appearRate: 0.78,
    color: "#c5a255",
    pageGroup: "RECOVERY",
  },
  {
    slug: "beer_pack",
    name: "맥주팩x4",
    icon: "🍺",
    price: 80,
    effect: "음주 2턴",
    description: "가볍게 한 캔... 네 캔이지만요.",
    stockMin: 1,
    stockMax: 3,
    appearRate: 0.65,
    color: "#b48c3c",
    pageGroup: "LUXURY",
  },
  {
    slug: "cig_1",
    name: "담배",
    icon: "🚬",
    price: 45,
    effect: "니코틴 1턴",
    description: "한 대 태우면 좀 나아질지도...",
    stockMin: 2,
    stockMax: 5,
    appearRate: 0.7,
    color: "#686460",
    pageGroup: "LUXURY",
  },
  {
    slug: "cig_5",
    name: "담배 (5턴)",
    icon: "🚬",
    price: 180,
    effect: "니코틴 5턴",
    description: "한 갑 통째로. 폐가 걱정되지만...",
    stockMin: 0,
    stockMax: 2,
    appearRate: 0.35,
    color: "#686460",
    pageGroup: "LUXURY",
  },
  {
    slug: "liquor",
    name: "독주",
    icon: "🥃",
    price: 260,
    effect: "음주 5턴",
    description: "아주 독한 술. 각오하고 드셔야 해요...",
    stockMin: 0,
    stockMax: 1,
    appearRate: 0.25,
    color: "#9b2020",
    pageGroup: "RARE",
  },
  {
    slug: "icecream",
    name: "서울-만세",
    icon: "🍦",
    price: 240,
    effect: "HP 30 / SAN 10",
    description: "전설의 아이스크림. 한 입이면 세상이 달라져요.",
    stockMin: 0,
    stockMax: 1,
    appearRate: 0.18,
    color: "#dcb43c",
    pageGroup: "RARE",
  },
  {
    slug: "force_core",
    name: "포스코어",
    icon: "💎",
    price: 450,
    effect: "???",
    description: "정체불명의 에너지 결정체. 강력한 힘이 느껴진다...",
    stockMin: 0,
    stockMax: 1,
    appearRate: 0.08,
    color: "#643cc8",
    pageGroup: "RARE",
  },
  {
    slug: "vf_blood",
    name: "VF혈액팩",
    icon: "🩸",
    price: 900,
    effect: "HP 전회복",
    description: "앙카가 맨날 사가서 항상 매진이에요...",
    stockMin: 0,
    stockMax: 0,
    appearRate: 0.0,
    color: "#b41414",
    pageGroup: "RARE",
  },
];

/* ── Lookup helpers ── */

/**
 * slug → item lookup (O(1)).
 *
 * Map 기반이라 단언(`as Record<string, ShopCatalogItem>`) 없이도 타입 안전.
 * 미존재 slug 는 `undefined` 반환 — 호출자가 분기 처리.
 */
const slugIndex = new Map<string, ShopCatalogItem>(
  SHOP_CATALOG.map((item) => [item.slug, item]),
);

export function findShopItemBySlug(slug: string): ShopCatalogItem | undefined {
  return slugIndex.get(slug);
}

/** 페이지 그룹별 아이템 묶음 (tia_bot SHOP_PAGES 와 정합). */
export const SHOP_PAGE_GROUPS: Record<ShopPageGroup, ShopCatalogItem[]> = {
  BASIC: SHOP_CATALOG.filter((item) => item.pageGroup === "BASIC"),
  RECOVERY: SHOP_CATALOG.filter((item) => item.pageGroup === "RECOVERY"),
  LUXURY: SHOP_CATALOG.filter((item) => item.pageGroup === "LUXURY"),
  RARE: SHOP_CATALOG.filter((item) => item.pageGroup === "RARE"),
};

/* ── 영업시간 ── */

/**
 * 편의점 영업 여부 판정.
 *
 * - 일요일 (Sun): 종일 마감.
 * - 월~토: KST 20 시 이전만 open. 20 시 이후 close.
 *
 * KST 변환은 `Intl.DateTimeFormat` 의 `Asia/Seoul` 을 통해 수행.
 * (Date 객체의 getDay/getHours 는 서버 OS 타임존 의존이라 사용하지 않음.)
 *
 * @param now 판정 기준 시각. 기본 new Date().
 * @returns true=영업중, false=마감.
 */
export function isShopOpen(now: Date = new Date()): boolean {
  // KST 기준 요일 (long: "Sunday" .. "Saturday") + 시간 (24h, "00".."23") 추출.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIMEZONE,
    weekday: "long",
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  // Intl 의 hour="2-digit" + hour12=false 는 24 시를 "24" 로 줄 수 있어 mod 24 보정.
  const hour = Number.parseInt(hourStr, 10) % 24;

  if (weekday === "Sunday") return false;
  return hour < CLOSE_HOUR_KST;
}
