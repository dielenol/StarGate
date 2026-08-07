import type { ObjectId } from "mongodb";

/**
 * MasterItem.category 의 단일 출처 (SSOT).
 * Zod enum 도 동일 배열로부터 유도하여 type/schema 가 절대 lag 하지 않도록 한다.
 * - 신규 카테고리 추가 시 이 배열만 수정 → `ItemCategory` 타입과 모든 schema enum 이 자동 반영됨
 */
export const ITEM_CATEGORIES = [
  "WEAPON",
  "ARMOR",
  "CONSUMABLE",
  "MATERIAL",
  "SPECIAL",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** 캐릭터 전투 장비 슬롯. 마스터 아이템 category 와 1:1로 대응한다. */
export const EQUIPMENT_SLOTS = ["WEAPON", "ARMOR"] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

/**
 * 편의점 페이지 그룹 — tia_bot `SHOP_PAGES` 와 정합.
 * 신규 카탈로그 인입 시에만 채움. 비편의점 아이템은 undefined.
 */
export type ShopPageGroup = "BASIC" | "RECOVERY" | "LUXURY" | "RARE";

/**
 * 편의점 전용 메타.
 *
 * - stockMin/stockMax: 일자별 재고 시드 범위 (KST 일자 단위).
 * - appearRate: 0.0 ~ 1.0. 최소 재고 보장 후 stockMax 로 입고될 확률.
 * - color: tia_bot 의 RGB tuple 을 hex 문자열(#RRGGBB) 로 변환.
 * - pageGroup: 페이지 분류. 미지정 시 기본 BASIC 으로 노출 가능.
 */
export interface ShopMeta {
  stockMin: number;
  stockMax: number;
  appearRate: number;
  /** 카드/알림 fallback에 쓰는 짧은 표시 아이콘(주로 emoji). */
  icon?: string;
  color?: string;
  pageGroup?: ShopPageGroup;
}

export type EquipmentActionKind = "CHARGED" | "STANCE" | "CONSUMABLE";

export interface EquipmentActionDamage {
  /** SOUND 피해는 훈련장 전투 규칙에 따라 HP가 아닌 SAN에 적용한다. */
  type: "PHYSICAL" | "FIRE" | "PSYCHIC" | "SOUND";
  amount: number;
  ignoresDefense?: boolean;
  scaling: "NONE" | "STANDARD";
}

export interface EquipmentActionConsumableCost {
  slug: string;
  quantity: number;
}

export interface EquipmentWeaponDamageBand {
  minCells: number;
  maxCells: number;
  damage: EquipmentActionDamage;
}

export interface EquipmentWeaponAttackProfile {
  weaponCategory: string;
  rangeMinCells: number;
  rangeMaxCells: number;
  /** 총기는 캐릭터 기본 ATK를 합산하지 않고 표기 피해만 사용한다. */
  usesCharacterAttack: false;
  consumesRegularAmmo: number;
  damageByRange: EquipmentWeaponDamageBand[];
}

/** 캐릭터 능력 슬롯과 분리되어 장착 장비가 제공하는 전용 액션. */
export interface EquipmentAction {
  code: string;
  name: string;
  description: string;
  effect: string;
  /** 기존 문서는 CHARGED로 간주한다. STANCE는 VTT 세션 상태만 바꾼다. */
  kind?: EquipmentActionKind;
  actionCost: number;
  chargeCost: number;
  maxCharges: number;
  reloadCreditCost: number;
  reloadApproval: "GM";
  /** false면 충전이 0이어도 공방 재장전 요청을 만들 수 없다. */
  reloadable?: boolean;
  requiresMounted?: boolean;
  consumesRegularAmmo?: number;
  /** VTT 격자 사거리. 둘 다 없으면 공격 액션은 실행 불가로 남긴다. */
  rangeMinCells?: number;
  rangeMaxCells?: number;
  damage?: EquipmentActionDamage;
  /** 무기의 구조화 기본 사격 프로필을 함께 사용한다. */
  usesWeaponAttack?: boolean;
  /**
   * 기본 사격과 별도 판정하는 고정 추가 효과.
   * SOUND는 HP 추가 피해가 아니라 SAN 감소로 처리한다.
   */
  additionalDamage?: EquipmentActionDamage;
  /** 장비 충전 대신 실제 인벤토리 소모품을 차감하는 비용. */
  consumableCost?: EquipmentActionConsumableCost;
}

export interface EquipmentMountRules {
  mountActionCost: number;
  unmountActionCost: number;
  blocksMovement: boolean;
  allowsDiagonalFire: boolean;
  /** 비거치 상태에서는 직선 방향 사격만 허용한다. */
  diagonalFireRequiresMounted?: boolean;
  /** 거치 중 대각선 사거리 계산 방식. DIAMOND는 맨해튼 거리다. */
  mountedRangeShape?: "DIAMOND";
  bonusDamage: number;
}

export interface EquipmentCombatProfile {
  ammoCapacity?: number;
  mount?: EquipmentMountRules;
  weaponAttack?: EquipmentWeaponAttackProfile;
}

/** 장착 중인 장비가 캐릭터의 기존 어빌리티 효과 문구를 대체한다. */
export interface EquipmentAbilityOverride {
  targetCode: string;
  effect: string;
}

/** 인벤토리 장비 인스턴스의 현재/최대 충전 상태. */
export interface EquipmentChargeState {
  current: number;
  maximum: number;
}

export interface LicenseQualification {
  authority: "TOWASKI";
  programVersion: number;
  qualifiedAt: Date;
  renewalDueAt?: Date;
}

export interface MasterItem {
  _id?: ObjectId;
  /**
   * 편의점 아이템 안정 식별자 (예: "cup_ramen").
   * 기존 row 는 비어 있을 수 있음. 신규 시드/카탈로그 인입 시에만 채움.
   * unique sparse index 가 걸려 있어 중복 방지 (인덱스명: master_items_slug_unique).
   */
  slug?: string;
  name: string;
  category: ItemCategory;
  description: string;
  price: number | string;
  damage?: string;
  effect?: string;
  /** 편의점 전용 메타. 비편의점 아이템은 undefined. */
  shopMeta?: ShopMeta;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
  /* ── equipment / consumable 카탈로그 mirror 필드 (optional) ──
     spec MD frontmatter + body 섹션을 master_items 에 적재할 때 사용.
     기존 비편의점/편의점 row 는 모두 undefined 로 유지되며 backward-compatible. */
  nameEn?: string;
  tags?: string[];
  previewImage?: string;
  isPublic?: boolean;
  lore?: {
    background?: string;
    acquisition?: string;
    notes?: string;
  };
  loreMd?: string;
  source?:
    | "discord"
    | "legacy-json"
    | "manual"
    | "create-lore"
    | "session-log"
    | "session-reward"
    | "containment-archive";
  authorId?: string;
  authorName?: string;
  /** 장착 중일 때만 ERP/VTT에 노출되는 장비 전용 액션. */
  equipmentAction?: EquipmentAction;
  /** 복수 전용 액션. 기존 equipmentAction은 하위 호환용으로 유지한다. */
  equipmentActions?: EquipmentAction[];
  /** 탄창·거치처럼 설명 문자열에서 추론하면 안 되는 전투 규칙. */
  combatProfile?: EquipmentCombatProfile;
  /** 장착 중일 때만 캐릭터 시트에 합성되는 기존 어빌리티 효과 대체. */
  equipmentAbilityOverrides?: EquipmentAbilityOverride[];
  /** GM 공방에서 생성한 캐릭터 전용 강화 결과의 추적 메타데이터. */
  workshop?: {
    requestId: string;
    ownerId: string;
    sourceItemId?: string;
    sourceItemName?: string;
    characterId: string;
    characterCodename: string;
    specialistCodename: string;
    specialistWorkflow?: Array<{
      specialistCodename: string;
      task: string;
    }>;
    blueprintRef?: {
      id: string;
      slug: string;
      version: number;
    };
    generation: number;
    lifecycle: "operational";
    balanceStatus: "approved";
  };
}

export interface CharacterInventory {
  _id?: ObjectId;
  characterId: string;
  characterCodename: string;
  itemId: string;
  itemName: string;
  quantity: number;
  acquiredAt: Date;
  note?: string;
  /** 장착 중인 전투 슬롯. 미설정이면 보유만 하고 장착하지 않은 상태다. */
  equippedSlot?: EquipmentSlot;
  /** 마지막 장착/교체 시각. equippedSlot 과 함께 설정·해제한다. */
  equippedAt?: Date;
  /** equipmentAction을 가진 장비 인스턴스의 충전 상태. */
  equipmentCharge?: EquipmentChargeState;
  /** 복수 액션의 코드별 충전 상태. */
  equipmentCharges?: Record<string, EquipmentChargeState>;
  /** 일반 탄약의 현재/최대 상태. */
  equipmentAmmo?: EquipmentChargeState;
  /** 라이선스 아이템의 시험 버전과 갱신 기한. 일반 아이템에는 미설정한다. */
  licenseQualification?: LicenseQualification;
}

export type SharedInventoryScope = "GLOBAL";

export interface SharedInventory {
  _id?: ObjectId;
  scope: SharedInventoryScope;
  itemId: string;
  itemName: string;
  quantity: number;
  acquiredAt: Date;
  note?: string;
}

export type CreateMasterItemInput = Omit<
  MasterItem,
  "_id" | "createdAt" | "updatedAt"
>;

export type CreateInventoryInput = Omit<CharacterInventory, "_id">;
export type CreateSharedInventoryInput = Omit<SharedInventory, "_id">;
