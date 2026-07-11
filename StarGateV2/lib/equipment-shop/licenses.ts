import type { MasterItem } from "@stargate/shared-db/types";

export type TowaskiLicenseSlug =
  | "towaski-license-basic-firearm"
  | "towaski-license-precision-firearm"
  | "towaski-license-heavy-weapon"
  | "towaski-license-flame-weapon"
  | "towaski-license-sonic-equipment"
  | "towaski-license-explosive-ordnance";

export interface TowaskiLicenseDefinition {
  slug: TowaskiLicenseSlug;
  code: string;
  name: string;
  label: string;
  price: number;
  description: string;
  effect: string;
  previewImage: string;
  tags: readonly string[];
}

export interface EquipmentLicenseRequirement {
  itemSlug: string;
  itemName: string;
  licenseSlug: TowaskiLicenseSlug;
  licenseName: string;
  label: string;
  reason: string;
  qualificationKeywords: readonly string[];
}

export interface EquipmentLicenseStatus {
  satisfied: boolean;
  source: "owned_license" | "cart_license" | "character_qualification" | null;
  matchedKeyword?: string;
  note?: string;
}

export function hasTowaskiBasicPurchaseAccess(args: {
  isGM: boolean;
  hasBasicLicense: boolean;
  licenseStatus?: EquipmentLicenseStatus;
}): boolean {
  return (
    args.isGM ||
    args.hasBasicLicense ||
    args.licenseStatus?.source === "character_qualification"
  );
}

export interface EquipmentCatalogLicenseContext {
  licenseStatus?: EquipmentLicenseStatus;
  licenseOwned?: boolean;
}

export interface EquipmentLicenseCharacter {
  codename?: string;
  lore?: {
    name?: string;
    nickname?: string;
    background?: string;
    personality?: string;
    roleDetail?: string;
    loreTags?: string[];
    relations?: Array<{
      targetCodename?: string;
      targetName?: string;
      label?: string;
      summary?: string;
    }>;
  };
  play?: {
    className?: string;
    abilityType?: string;
    weaponTraining?: string[];
    skillTraining?: string[];
    equipment?: Array<{
      name?: string;
      description?: string;
      damage?: string;
      effect?: string;
    }>;
    abilities?: Array<{
      name?: string;
      description?: string;
      effect?: string;
    }>;
  };
}

interface EquipmentLicenseRule {
  licenseSlug: TowaskiLicenseSlug;
  reason: string;
  qualificationKeywords: readonly string[];
}

export const TOWASKI_LICENSE_TAG_KEYWORDS = [
  "토와스키",
  "토와스키건샵",
  "토와스키 건샵",
  "라이센스",
  "무기라이센스",
  "무기 라이센스",
  "반출자격",
  "반출 자격",
  "반출허가",
  "반출 허가",
] as const;

export const TOWASKI_LICENSE_DEFINITIONS: Record<
  TowaskiLicenseSlug,
  TowaskiLicenseDefinition
> = {
  "towaski-license-basic-firearm": {
    slug: "towaski-license-basic-firearm",
    code: "TOWASKI_LICENSE_BASIC_FIREARM",
    name: "토와스키 기본 화기 라이센스",
    label: "기본 화기",
    price: 80,
    description:
      "권총, 돌격소총, 산탄총 계열 보급 화기의 반출 자격을 등록하는 토와스키 건샵 라이센스.",
    effect: "권총·소총·산탄총 반출 자격",
    previewImage: "/assets/catalog/equipment/towaski-license-basic-firearm.svg",
    tags: ["병기부", "토와스키", "라이센스", "무기라이센스", "반출자격"],
  },
  "towaski-license-precision-firearm": {
    slug: "towaski-license-precision-firearm",
    code: "TOWASKI_LICENSE_PRECISION_FIREARM",
    name: "토와스키 정밀 사격 라이센스",
    label: "정밀 사격",
    price: 120,
    description:
      "저격소총과 장거리 정밀 화기의 반출 자격을 등록하는 토와스키 건샵 라이센스.",
    effect: "저격소총 반출 자격",
    previewImage:
      "/assets/catalog/equipment/towaski-license-precision-firearm.svg",
    tags: ["병기부", "토와스키", "라이센스", "정밀사격", "반출자격"],
  },
  "towaski-license-heavy-weapon": {
    slug: "towaski-license-heavy-weapon",
    code: "TOWASKI_LICENSE_HEAVY_WEAPON",
    name: "토와스키 중화기 라이센스",
    label: "중화기",
    price: 160,
    description:
      "설치화기와 중기관총 계열의 반출 자격을 등록하는 토와스키 건샵 라이센스.",
    effect: "중기관총·설치화기 반출 자격",
    previewImage: "/assets/catalog/equipment/towaski-license-heavy-weapon.svg",
    tags: ["병기부", "토와스키", "라이센스", "중화기", "반출자격"],
  },
  "towaski-license-flame-weapon": {
    slug: "towaski-license-flame-weapon",
    code: "TOWASKI_LICENSE_FLAME_WEAPON",
    name: "토와스키 화염 장비 라이센스",
    label: "화염 장비",
    price: 140,
    description:
      "화염방사기 등 연료통 기반 화염 장비의 반출 자격을 등록하는 토와스키 건샵 라이센스.",
    effect: "화염방사기 반출 자격",
    previewImage: "/assets/catalog/equipment/towaski-license-flame-weapon.svg",
    tags: ["병기부", "토와스키", "라이센스", "화염무기", "반출자격"],
  },
  "towaski-license-sonic-equipment": {
    slug: "towaski-license-sonic-equipment",
    code: "TOWASKI_LICENSE_SONIC_EQUIPMENT",
    name: "토와스키 음파 장비 라이센스",
    label: "음파 장비",
    price: 160,
    description:
      "음파 방출기와 청각성 장비의 출력 봉인·반출 자격을 등록하는 토와스키 건샵 라이센스.",
    effect: "음파 방출기 반출 자격",
    previewImage:
      "/assets/catalog/equipment/towaski-license-sonic-equipment.svg",
    tags: ["병기부", "토와스키", "라이센스", "음파무기", "반출자격"],
  },
  "towaski-license-explosive-ordnance": {
    slug: "towaski-license-explosive-ordnance",
    code: "TOWASKI_LICENSE_EXPLOSIVE_ORDNANCE",
    name: "토와스키 폭발물 취급 라이센스",
    label: "폭발물 취급",
    price: 180,
    description:
      "수류탄, 로켓 런처 등 폭발형 장구류의 반출 자격을 등록하는 토와스키 건샵 라이센스.",
    effect: "수류탄·로켓 런처 반출 자격",
    previewImage:
      "/assets/catalog/equipment/towaski-license-explosive-ordnance.svg",
    tags: ["병기부", "토와스키", "라이센스", "폭발형무기", "반출자격"],
  },
};

export const TOWASKI_LICENSE_ITEMS = Object.values(
  TOWASKI_LICENSE_DEFINITIONS,
);

const EQUIPMENT_LICENSE_RULES: Record<string, EquipmentLicenseRule> = {
  "basic-pistol": {
    licenseSlug: "towaski-license-basic-firearm",
    reason: "소형 화기 반출",
    qualificationKeywords: ["권총", "소형화기", "보급형권총"],
  },
  "basic-assault-rifle": {
    licenseSlug: "towaski-license-basic-firearm",
    reason: "소총류 반출",
    qualificationKeywords: [
      "소총류",
      "소총",
      "돌격소총",
      "자동소총",
      "사냥용소총",
    ],
  },
  "basic-shotgun": {
    licenseSlug: "towaski-license-basic-firearm",
    reason: "산탄 화기 반출",
    qualificationKeywords: ["샷건", "산탄총", "산탄"],
  },
  "basic-sniper-rifle": {
    licenseSlug: "towaski-license-precision-firearm",
    reason: "장거리 정밀 화기 반출",
    qualificationKeywords: ["저격소총", "저격", "정밀사격"],
  },
  "basic-heavy-machine-gun": {
    licenseSlug: "towaski-license-heavy-weapon",
    reason: "설치화기 반출",
    qualificationKeywords: ["중기관총", "설치화기", "거치화기", "중화기"],
  },
  "basic-flamethrower": {
    licenseSlug: "towaski-license-flame-weapon",
    reason: "연료통 기반 화염 장비 반출",
    qualificationKeywords: ["화염방사기", "화염방사", "화염무기"],
  },
  "basic-sonic-emitter": {
    licenseSlug: "towaski-license-sonic-equipment",
    reason: "음파 장비 출력 봉인 반출",
    qualificationKeywords: [
      "음파방출기",
      "나노테크놀로지음파방출기",
      "소닉이미터",
      "음파무기",
      "음파",
    ],
  },
  "rocket-launcher": {
    licenseSlug: "towaski-license-explosive-ordnance",
    reason: "폭발형 중화기 반출",
    qualificationKeywords: [
      "로켓런처",
      "로켓",
      "폭발형무기",
      "폭발물",
      "폭약",
      "중화기",
    ],
  },
  "military-fragment-grenade": {
    licenseSlug: "towaski-license-explosive-ordnance",
    reason: "군용 폭발 장구 반출",
    qualificationKeywords: [
      "수류탄",
      "투척무기",
      "폭발형무기",
      "폭발물",
      "폭약",
      "투척",
    ],
  },
};

export function isTowaskiLicenseSlug(
  value: string | null | undefined,
): value is TowaskiLicenseSlug {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TOWASKI_LICENSE_DEFINITIONS, value)
  );
}

export function getEquipmentLicenseRequirement(
  item: Pick<MasterItem, "slug" | "name">,
): EquipmentLicenseRequirement | null {
  const slug = item.slug?.trim();
  if (!slug) return null;

  const rule = EQUIPMENT_LICENSE_RULES[slug];
  if (!rule) return null;

  const license = TOWASKI_LICENSE_DEFINITIONS[rule.licenseSlug];
  return {
    itemSlug: slug,
    itemName: item.name,
    licenseSlug: license.slug,
    licenseName: license.name,
    label: license.label,
    reason: rule.reason,
    qualificationKeywords: rule.qualificationKeywords,
  };
}

export function resolveEquipmentLicenseStatus(args: {
  character: EquipmentLicenseCharacter;
  requirement: EquipmentLicenseRequirement;
  ownedLicenseSlugs?: ReadonlySet<string>;
  cartLicenseSlugs?: ReadonlySet<string>;
}): EquipmentLicenseStatus {
  const { character, requirement, ownedLicenseSlugs, cartLicenseSlugs } = args;

  if (ownedLicenseSlugs?.has(requirement.licenseSlug)) {
    return { satisfied: true, source: "owned_license" };
  }

  if (cartLicenseSlugs?.has(requirement.licenseSlug)) {
    return { satisfied: true, source: "cart_license" };
  }

  const exception = findCharacterLicenseException(character, requirement);
  if (exception) {
    return {
      satisfied: true,
      source: "character_qualification",
      matchedKeyword: exception.matchedKeyword,
      note: exception.note,
    };
  }

  return { satisfied: false, source: null };
}

export function resolveEquipmentCatalogLicenseContext(
  item: Pick<MasterItem, "slug" | "name">,
  context: {
    character: EquipmentLicenseCharacter | null;
    ownedLicenseSlugs: ReadonlySet<string>;
  },
): EquipmentCatalogLicenseContext {
  const licenseOwned = isTowaskiLicenseSlug(item.slug)
    ? context.ownedLicenseSlugs.has(item.slug)
    : undefined;
  const requirement = getEquipmentLicenseRequirement(item);
  const licenseStatus = requirement
    ? context.character
      ? resolveEquipmentLicenseStatus({
          character: context.character,
          requirement,
          ownedLicenseSlugs: context.ownedLicenseSlugs,
        })
      : { satisfied: false as const, source: null }
    : undefined;

  return {
    ...(licenseOwned !== undefined ? { licenseOwned } : {}),
    ...(licenseStatus ? { licenseStatus } : {}),
  };
}

function findCharacterLicenseException(
  character: EquipmentLicenseCharacter,
  requirement: EquipmentLicenseRequirement,
):
  | {
      matchedKeyword: string;
      note: string;
    }
  | null {
  if (requirement.itemSlug === "basic-flamethrower" && isParkAesol(character)) {
    return {
      matchedKeyword: "박애솔 / 토와스키 화염방사기 특전",
      note: "토와스키가 박애솔에게 화염방사기 계열 반출 예외를 두는 설정을 반영합니다.",
    };
  }

  if (requirement.itemSlug === "basic-sonic-emitter" && isStarckIlonison(character)) {
    return {
      matchedKeyword: "스타크 일로니손 / 음파 방출기 특전",
      note: "스타크 일로니손의 전용 음파 방출기 운용 설정을 반영합니다.",
    };
  }

  return null;
}

function isParkAesol(character: EquipmentLicenseCharacter): boolean {
  const tokens = [
    character.codename,
    character.lore?.name,
    character.lore?.nickname,
    ...(character.lore?.loreTags ?? []),
  ].map(normalizeSearchText);

  return tokens.some(
    (token) =>
      token.includes("박애솔") ||
      token.includes("빅보이") ||
      token.includes("bigboy"),
  );
}

function isStarckIlonison(character: EquipmentLicenseCharacter): boolean {
  const tokens = [
    character.codename,
    character.lore?.name,
    character.lore?.nickname,
  ].map(normalizeSearchText);

  return tokens.some(
    (token) =>
      token.includes("스타크일로니손") ||
      token.includes("starckilonison") ||
      token === "clown",
  );
}

function normalizeSearchText(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/[\s_\-./()[\]{}·:|]+/g, "")
    .toLowerCase();
}
