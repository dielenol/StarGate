import { ITEM_CATEGORIES } from "@stargate/shared-db";

import type {
  CreateMasterItemInput,
  ItemCategory,
  ShopMeta,
  ShopPageGroup,
} from "@stargate/shared-db";

export const CATALOG_TARGETS = ["shop", "armory"] as const;
export const ARMORY_ZONES = ["towaski", "acheron", "strategic"] as const;
export const SHOP_PAGE_GROUPS = [
  "BASIC",
  "RECOVERY",
  "LUXURY",
  "RARE",
] as const satisfies readonly ShopPageGroup[];

export type CatalogTarget = (typeof CATALOG_TARGETS)[number];
export type ArmoryZone = (typeof ARMORY_ZONES)[number];

export type CatalogItemCreateRequest =
  | (Omit<CreateMasterItemInput, "shopMeta"> & {
      target: "shop";
      shopMeta: ShopMeta;
      armoryZone?: never;
    })
  | (Omit<CreateMasterItemInput, "shopMeta"> & {
      target: "armory";
      armoryZone: ArmoryZone;
      shopMeta?: never;
    });

interface NormalizedCatalogItemCreate {
  input: CreateMasterItemInput;
  target?: CatalogTarget;
}

type NormalizeCatalogItemCreateResult =
  | { ok: true; value: NormalizedCatalogItemCreate }
  | { ok: false; error: string };

export function shouldAnnounceShopProductLaunch(
  value: NormalizedCatalogItemCreate,
): boolean {
  return (
    value.target === "shop" &&
    value.input.isAvailable === true &&
    value.input.isPublic === true
  );
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const LOCAL_ASSET_PATTERN = /^\/assets\/[a-zA-Z0-9_./-]+$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 4_000;
const MAX_TAG_COUNT = 30;
const MAX_TAG_LENGTH = 60;
const MAX_STOCK = 999;
const MAX_CATALOG_PRICE = 1_000_000_000;

const SOURCE_VALUES = new Set<CreateMasterItemInput["source"]>([
  "discord",
  "legacy-json",
  "manual",
  "create-lore",
  "session-log",
  "session-reward",
  "containment-archive",
]);

const ARMORY_ZONE_CATEGORIES: Record<ArmoryZone, readonly ItemCategory[]> = {
  towaski: ["WEAPON", "ARMOR", "CONSUMABLE"],
  acheron: ["WEAPON", "ARMOR"],
  strategic: ["SPECIAL"],
};

const ARMORY_ZONE_TAGS: Record<ArmoryZone, readonly string[]> = {
  towaski: ["병기부", "토와스키"],
  acheron: ["병기부", "아케론"],
  strategic: ["병기부", "전략자산"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeLocalAssetPath(value: string): boolean {
  if (!LOCAL_ASSET_PATTERN.test(value) || value.includes("//")) return false;
  return !value
    .slice("/assets/".length)
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

function isItemCategory(value: unknown): value is ItemCategory {
  return (
    typeof value === "string" &&
    (ITEM_CATEGORIES as readonly string[]).includes(value)
  );
}

function isCatalogTarget(value: unknown): value is CatalogTarget {
  return (
    typeof value === "string" &&
    (CATALOG_TARGETS as readonly string[]).includes(value)
  );
}

function isArmoryZone(value: unknown): value is ArmoryZone {
  return (
    typeof value === "string" &&
    (ARMORY_ZONES as readonly string[]).includes(value)
  );
}

function trimmedString(
  value: unknown,
  field: string,
  options: { required?: boolean; max?: number } = {},
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return options.required
      ? { ok: false, error: `${field}은(는) 필수입니다.` }
      : { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${field}은(는) 문자열이어야 합니다.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return options.required
      ? { ok: false, error: `${field}은(는) 필수입니다.` }
      : { ok: true, value: undefined };
  }
  if (trimmed.length > (options.max ?? MAX_TEXT_LENGTH)) {
    return { ok: false, error: `${field}이(가) 너무 깁니다.` };
  }
  return { ok: true, value: trimmed };
}

function normalizePrice(
  value: unknown,
  operational: boolean,
): { ok: true; value: number | string } | { ok: false; error: string } {
  if (!operational && typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed && !Number.isFinite(Number(trimmed))) {
      return { ok: true, value: trimmed };
    }
  }
  const price =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : 0;
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "price는 0 이상의 유한한 값이어야 합니다." };
  }
  if (
    operational &&
    (!Number.isSafeInteger(price) ||
      price <= 0 ||
      price > MAX_CATALOG_PRICE)
  ) {
    return {
      ok: false,
      error: `운영 카탈로그 price는 1~${MAX_CATALOG_PRICE.toLocaleString("ko-KR")} 사이의 정수여야 합니다.`,
    };
  }
  return { ok: true, value: price };
}

function normalizeBoolean(
  value: unknown,
  field: string,
  fallback: boolean,
): { ok: true; value: boolean } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: fallback };
  if (typeof value !== "boolean") {
    return { ok: false, error: `${field}은(는) boolean이어야 합니다.` };
  }
  return { ok: true, value };
}

function normalizeTags(
  value: unknown,
): { ok: true; value?: string[] } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    return { ok: false, error: "tags는 문자열 배열이어야 합니다." };
  }
  const tags = Array.from(
    new Set(value.map((tag) => tag.trim()).filter(Boolean)),
  );
  if (
    tags.length > MAX_TAG_COUNT ||
    tags.some((tag) => tag.length > MAX_TAG_LENGTH)
  ) {
    return {
      ok: false,
      error: "tags의 개수 또는 길이가 허용 범위를 벗어났습니다.",
    };
  }
  return { ok: true, value: tags.length > 0 ? tags : undefined };
}

function normalizeShopMeta(
  value: unknown,
): { ok: true; value: ShopMeta } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "편의점 shopMeta는 필수입니다." };
  }
  const stockMin = value.stockMin;
  const stockMax = value.stockMax;
  const appearRate = value.appearRate;
  if (
    typeof stockMin !== "number" ||
    typeof stockMax !== "number" ||
    !Number.isInteger(stockMin) ||
    !Number.isInteger(stockMax) ||
    stockMin < 1 ||
    stockMax < stockMin ||
    stockMax > MAX_STOCK
  ) {
    return {
      ok: false,
      error: `stockMin/stockMax는 1~${MAX_STOCK} 범위의 정수이며 min ≤ max여야 합니다.`,
    };
  }
  if (
    typeof appearRate !== "number" ||
    !Number.isFinite(appearRate) ||
    appearRate < 0 ||
    appearRate > 1
  ) {
    return { ok: false, error: "appearRate는 0~1 사이여야 합니다." };
  }
  if (
    value.pageGroup !== undefined &&
    !(
      typeof value.pageGroup === "string" &&
      (SHOP_PAGE_GROUPS as readonly string[]).includes(value.pageGroup)
    )
  ) {
    return { ok: false, error: "유효한 pageGroup을 선택하세요." };
  }
  const icon = trimmedString(value.icon, "shopMeta.icon", { max: 16 });
  if (!icon.ok) return icon;
  const color = trimmedString(value.color, "shopMeta.color", { max: 7 });
  if (!color.ok) return color;
  if (color.value && !HEX_COLOR_PATTERN.test(color.value)) {
    return {
      ok: false,
      error: "shopMeta.color는 #RRGGBB 형식이어야 합니다.",
    };
  }
  return {
    ok: true,
    value: {
      stockMin,
      stockMax,
      appearRate,
      ...(icon.value ? { icon: icon.value } : {}),
      ...(color.value ? { color: color.value } : {}),
      ...(value.pageGroup
        ? { pageGroup: value.pageGroup as ShopPageGroup }
        : {}),
    },
  };
}

function normalizeLore(
  value: unknown,
):
  | { ok: true; value?: CreateMasterItemInput["lore"] }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isRecord(value)) {
    return { ok: false, error: "lore는 객체여야 합니다." };
  }
  const background = trimmedString(value.background, "lore.background");
  if (!background.ok) return background;
  const acquisition = trimmedString(value.acquisition, "lore.acquisition");
  if (!acquisition.ok) return acquisition;
  const notes = trimmedString(value.notes, "lore.notes");
  if (!notes.ok) return notes;
  const lore = {
    ...(background.value ? { background: background.value } : {}),
    ...(acquisition.value ? { acquisition: acquisition.value } : {}),
    ...(notes.value ? { notes: notes.value } : {}),
  };
  return {
    ok: true,
    value: Object.keys(lore).length > 0 ? lore : undefined,
  };
}

export function normalizeCatalogItemCreateBody(
  body: unknown,
): NormalizeCatalogItemCreateResult {
  if (!isRecord(body)) {
    return { ok: false, error: "요청 본문이 올바르지 않습니다." };
  }
  if (body.target !== undefined && !isCatalogTarget(body.target)) {
    return { ok: false, error: "유효한 target을 선택하세요." };
  }
  const target = body.target;
  const operational = target !== undefined;
  if (!target && (body.shopMeta !== undefined || body.armoryZone !== undefined)) {
    return {
      ok: false,
      error:
        "shopMeta/armoryZone은 target이 지정된 GM 운영 요청에서만 사용할 수 있습니다.",
    };
  }

  const name = trimmedString(body.name, "name", {
    required: true,
    max: MAX_NAME_LENGTH,
  });
  if (!name.ok) return name;
  if (!name.value) {
    return { ok: false, error: "name은(는) 필수입니다." };
  }
  const slug = trimmedString(body.slug, "slug", {
    required: operational,
    max: 80,
  });
  if (!slug.ok) return slug;
  if (slug.value && !SLUG_PATTERN.test(slug.value)) {
    return {
      ok: false,
      error:
        "slug는 2~80자의 영문 소문자·숫자·하이픈·밑줄만 사용할 수 있습니다.",
    };
  }
  if (!isItemCategory(body.category)) {
    return { ok: false, error: "유효한 category를 선택하세요." };
  }
  const category = body.category;
  const price = normalizePrice(body.price, operational);
  if (!price.ok) return price;
  const description = trimmedString(body.description, "description");
  if (!description.ok) return description;
  const damage = trimmedString(body.damage, "damage", { max: 500 });
  if (!damage.ok) return damage;
  const effect = trimmedString(body.effect, "effect", { max: 1_000 });
  if (!effect.ok) return effect;
  const tags = normalizeTags(body.tags);
  if (!tags.ok) return tags;
  const previewImage = trimmedString(body.previewImage, "previewImage", {
    max: 500,
  });
  if (!previewImage.ok) return previewImage;
  if (
    operational &&
    previewImage.value &&
    !isSafeLocalAssetPath(previewImage.value)
  ) {
    return {
      ok: false,
      error:
        "운영 카탈로그 이미지는 /assets/ 아래의 로컬 경로만 사용할 수 있습니다.",
    };
  }
  const isAvailable = normalizeBoolean(
    body.isAvailable,
    "isAvailable",
    true,
  );
  if (!isAvailable.ok) return isAvailable;
  const isPublic = normalizeBoolean(body.isPublic, "isPublic", true);
  if (!isPublic.ok) return isPublic;
  const lore = normalizeLore(body.lore);
  if (!lore.ok) return lore;
  const loreMd = trimmedString(body.loreMd, "loreMd", { max: 100_000 });
  if (!loreMd.ok) return loreMd;
  const authorId = trimmedString(body.authorId, "authorId", { max: 120 });
  if (!authorId.ok) return authorId;
  const authorName = trimmedString(body.authorName, "authorName", { max: 120 });
  if (!authorName.ok) return authorName;
  if (
    body.source !== undefined &&
    !SOURCE_VALUES.has(body.source as CreateMasterItemInput["source"])
  ) {
    return { ok: false, error: "유효한 source를 선택하세요." };
  }

  let normalizedTags = tags.value;
  let shopMeta: ShopMeta | undefined;
  if (target === "shop") {
    if (category !== "CONSUMABLE") {
      return {
        ok: false,
        error: "편의점 품목 category는 CONSUMABLE이어야 합니다.",
      };
    }
    const normalizedShopMeta = normalizeShopMeta(body.shopMeta);
    if (!normalizedShopMeta.ok) return normalizedShopMeta;
    shopMeta = normalizedShopMeta.value;
  } else if (target === "armory") {
    if (!isArmoryZone(body.armoryZone)) {
      return { ok: false, error: "유효한 병기부 존을 선택하세요." };
    }
    if (!ARMORY_ZONE_CATEGORIES[body.armoryZone].includes(category)) {
      return {
        ok: false,
        error: `${body.armoryZone} 존에서 지원하지 않는 category 조합입니다.`,
      };
    }
    normalizedTags = Array.from(
      new Set([
        ...(normalizedTags ?? []),
        ...ARMORY_ZONE_TAGS[body.armoryZone],
      ]),
    );
    if (normalizedTags.length > MAX_TAG_COUNT) {
      return {
        ok: false,
        error: `병기부 자동 분류 태그를 포함해 tags는 최대 ${MAX_TAG_COUNT}개까지 등록할 수 있습니다.`,
      };
    }
  }

  return {
    ok: true,
    value: {
      target,
      input: {
        ...(slug.value ? { slug: slug.value } : {}),
        name: name.value,
        category,
        description: description.value ?? "",
        price: price.value,
        ...(damage.value ? { damage: damage.value } : {}),
        ...(effect.value ? { effect: effect.value } : {}),
        ...(shopMeta ? { shopMeta } : {}),
        isAvailable: isAvailable.value,
        ...(normalizedTags ? { tags: normalizedTags } : {}),
        ...(previewImage.value ? { previewImage: previewImage.value } : {}),
        isPublic: isPublic.value,
        ...(lore.value ? { lore: lore.value } : {}),
        ...(loreMd.value ? { loreMd: loreMd.value } : {}),
        source:
          (body.source as CreateMasterItemInput["source"] | undefined) ??
          "manual",
        ...(authorId.value ? { authorId: authorId.value } : {}),
        ...(authorName.value ? { authorName: authorName.value } : {}),
      },
    },
  };
}
