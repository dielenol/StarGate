import type {
  EquipmentAction,
  EquipmentAbilityOverride,
  EquipmentChargeState,
  EquipmentCombatProfile,
  EquipmentSlot,
  ItemCategory,
} from "@stargate/shared-db/types";

export const EQUIPMENT_WORKSHOP_REQUEST_STATUSES = [
  "REQUESTED",
  "IN_REVIEW",
  "APPROVED",
  "QUOTED",
  "IN_PROGRESS",
  "DECLINED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
] as const;

export const WORKSHOP_REQUEST_DETAIL_MIN_LENGTH = 10;
export const WORKSHOP_REQUEST_DETAIL_MAX_LENGTH = 1000;
export const WORKSHOP_QUOTE_MIN_DURATION_MINUTES = 1_440;
export const WORKSHOP_QUOTE_MAX_DURATION_MINUTES = 43_200;
export const WORKSHOP_QUOTE_MAX_MATERIAL_QUANTITY = 999;
export const WORKSHOP_RELOAD_REQUEST_DETAILS = "장착 장비 액션 재장전 승인 요청";

export const WORKSHOP_COST_POLICY = {
  utilityCreditRange: [200, 500],
  actionLaborRateRange: [0.2, 0.4],
  advancedCreditRange: [1_500, 2_200],
} as const;

export type EquipmentWorkshopRequestKind = "upgrade" | "custom" | "reload";
export type EquipmentWorkshopMaterialScope = "CHARACTER" | "SHARED";
export type EquipmentWorkshopRequestStatus =
  (typeof EQUIPMENT_WORKSHOP_REQUEST_STATUSES)[number];
export const EQUIPMENT_WORKSHOP_ACTIVE_STATUSES = [
  "REQUESTED",
  "IN_REVIEW",
  "APPROVED",
  "QUOTED",
  "IN_PROGRESS",
] as const satisfies readonly EquipmentWorkshopRequestStatus[];
export const EQUIPMENT_WORKSHOP_TERMINAL_STATUSES = [
  "COMPLETED",
  "DECLINED",
  "REJECTED",
  "CANCELLED",
] as const satisfies readonly EquipmentWorkshopRequestStatus[];
export type EquipmentWorkshopComputedStatus =
  | EquipmentWorkshopRequestStatus
  | "READY";
export type EquipmentWorkshopSpecialist =
  | "VERNIER"
  | "TEMPER"
  | "TOWASKI"
  | "SUTURE"
  | "RATCHET";
export const EQUIPMENT_WORKSHOP_SPECIALISTS: readonly EquipmentWorkshopSpecialist[] = [
  "VERNIER",
  "TEMPER",
  "TOWASKI",
  "SUTURE",
  "RATCHET",
];
export interface EquipmentWorkshopSpecialistStep {
  specialistCodename: EquipmentWorkshopSpecialist;
  task: string;
}
export type EquipmentWorkshopModificationDomain =
  | "GENERAL"
  | "ENERGY_EXPLOSIVE_OUTPUT"
  | "BIO_REGEN_REPAIR";

export interface EquipmentWorkshopMaterial {
  itemId: string;
  /** 신규 견적의 안정 재료 식별자. 기존 견적은 itemId만 존재할 수 있다. */
  slug?: string;
  itemName: string;
  category: ItemCategory;
  /** 기존 견적은 CHARACTER로 해석한다. */
  scope?: EquipmentWorkshopMaterialScope;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface EquipmentWorkshopConditionalOutput {
  itemId: string;
  slug: string;
  itemName: string;
  category: ItemCategory;
  scope: EquipmentWorkshopMaterialScope;
  quantity: number;
}

export interface EquipmentWorkshopApprovalGate {
  mode: "BUREAUCRAT_VOTE";
  presetKey?: string;
  title: string;
  content: string;
  conditionalMaterials: EquipmentWorkshopMaterial[];
  approvedOutputs: EquipmentWorkshopConditionalOutput[];
}

export interface EquipmentWorkshopResultBlueprint {
  itemId: string;
  slug: string;
  name: string;
  description: string;
  category: "WEAPON" | "ARMOR";
  damage?: string;
  effect?: string;
  tags: string[];
  previewImage?: string;
  equipmentAction?: EquipmentAction;
  equipmentActions?: EquipmentAction[];
  combatProfile?: EquipmentCombatProfile;
  equipmentAbilityOverrides?: EquipmentAbilityOverride[];
  generation: number;
}

export interface EquipmentWorkshopQuote {
  version: number;
  creditCost: number;
  durationMinutes: number;
  specialistCodename: EquipmentWorkshopSpecialist;
  specialistWorkflow?: EquipmentWorkshopSpecialistStep[];
  specialistNote?: string;
  modificationDomain: EquipmentWorkshopModificationDomain;
  materials: EquipmentWorkshopMaterial[];
  approvalGate?: EquipmentWorkshopApprovalGate;
  materialCost: number;
  totalCost: number;
  blueprintRef?: EquipmentWorkshopBlueprintRef;
  result: EquipmentWorkshopResultBlueprint;
  issuedAt: string;
  issuedById?: string;
  issuedByName?: string;
}

export interface EquipmentWorkshopBlueprintRef {
  id: string;
  slug: string;
  version: number;
}

export interface EquipmentWorkshopEscrow {
  sourceItemId?: string;
  sourceItemName?: string;
  sourceSlot?: EquipmentSlot;
  materials: EquipmentWorkshopMaterial[];
  creditCost: number;
  sourceEquipmentCharge?: EquipmentChargeState;
  sourceEquipmentCharges?: Record<string, EquipmentChargeState>;
  sourceEquipmentAmmo?: EquipmentChargeState;
  sourceNote?: string;
}

export interface EquipmentWorkshopReload {
  actionCode: string;
  creditCost: number;
}

export interface SerializedEquipmentWorkshopRequest {
  _id: string;
  kind: EquipmentWorkshopRequestKind;
  userId: string;
  userName: string;
  characterId: string;
  characterCodename: string;
  inventoryEntryId?: string;
  sourceItemId?: string;
  sourceCategory?: ItemCategory;
  sourceSlot?: EquipmentSlot;
  sourceDamage?: string;
  sourcePreviewImage?: string;
  equipmentName?: string;
  details: string;
  status: EquipmentWorkshopRequestStatus;
  computedStatus: EquipmentWorkshopComputedStatus;
  quote?: EquipmentWorkshopQuote;
  escrow?: EquipmentWorkshopEscrow;
  reload?: EquipmentWorkshopReload;
  startedAt?: string;
  readyAt?: string;
  claimedAt?: string;
  approvalVoteId?: string;
  approvalOutcome?: "APPROVED" | "REJECTED";
  approvalResolvedAt?: string;
  reloadedAt?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  operatorNote?: string;
  history?: Array<{
    status: EquipmentWorkshopRequestStatus;
    at: string;
    actorId?: string;
    actorName?: string;
    note?: string;
    quoteVersion?: number;
  }>;
}

export interface AdminSerializedEquipmentWorkshopRequest
  extends SerializedEquipmentWorkshopRequest {
  internalNote?: string;
  reviewedById?: string;
  reviewedByName?: string;
}

export interface EquipmentWorkshopRequestInput {
  kind: EquipmentWorkshopRequestKind;
  details: string;
  inventoryEntryId?: string;
}

export interface EquipmentWorkshopRequestResponse {
  ok: true;
  kind: EquipmentWorkshopRequestKind;
  message: string;
  request: SerializedEquipmentWorkshopRequest;
}

export interface EquipmentWorkshopQuoteInput {
  expectedVersion: number;
  creditCost: number;
  durationMinutes: number;
  specialistCodename?: EquipmentWorkshopSpecialist;
  specialistWorkflow?: EquipmentWorkshopSpecialistStep[];
  specialistNote?: string;
  modificationDomain: EquipmentWorkshopModificationDomain;
  blueprintRef?: EquipmentWorkshopBlueprintRef;
  materials: Array<{
    slug?: string;
    itemId?: string;
    scope?: EquipmentWorkshopMaterialScope;
    quantity: number;
  }>;
  approvalGate?: {
    mode: "BUREAUCRAT_VOTE";
    presetKey?: string;
    title: string;
    content: string;
    conditionalMaterials: Array<{
      slug?: string;
      itemId?: string;
      scope?: EquipmentWorkshopMaterialScope;
      quantity: number;
    }>;
    approvedOutputs: Array<{
      slug: string;
      scope?: EquipmentWorkshopMaterialScope;
      quantity: number;
    }>;
  };
  result: {
    category?: "WEAPON" | "ARMOR";
    name: string;
    description: string;
    damage?: string;
    effect?: string;
    tags?: string[];
    previewImage?: string;
    equipmentAction?: EquipmentAction;
    equipmentActions?: EquipmentAction[];
    combatProfile?: EquipmentCombatProfile;
    equipmentAbilityOverrides?: EquipmentAbilityOverride[];
  };
  internalNote?: string;
}

export type EquipmentWorkshopRequestValidation =
  | { ok: true; input: EquipmentWorkshopRequestInput }
  | { ok: false; error: string };

export type EquipmentWorkshopQuoteValidation =
  | { ok: true; input: EquipmentWorkshopQuoteInput }
  | { ok: false; error: string };

export function isEquipmentWorkshopRequestStatus(
  value: unknown,
): value is EquipmentWorkshopRequestStatus {
  return (
    typeof value === "string" &&
    (EQUIPMENT_WORKSHOP_REQUEST_STATUSES as readonly string[]).includes(value)
  );
}

export function isActiveEquipmentWorkshopRequestStatus(
  status: EquipmentWorkshopRequestStatus,
): boolean {
  return (EQUIPMENT_WORKSHOP_ACTIVE_STATUSES as readonly string[]).includes(
    status,
  );
}

export function mergeEquipmentWorkshopRequestLists<
  T extends { _id: string },
>(activeRequests: readonly T[], recentRequests: readonly T[]): T[] {
  const activeRequestIds = new Set(
    activeRequests.map((request) => request._id),
  );

  return [
    ...activeRequests,
    ...recentRequests.filter(
      (request) => !activeRequestIds.has(request._id),
    ),
  ];
}

export function canTransitionEquipmentWorkshopRequestStatus(
  current: EquipmentWorkshopRequestStatus,
  next: EquipmentWorkshopRequestStatus,
): boolean {
  const transitions: Record<
    EquipmentWorkshopRequestStatus,
    readonly EquipmentWorkshopRequestStatus[]
  > = {
    REQUESTED: ["IN_REVIEW", "APPROVED", "QUOTED", "COMPLETED", "REJECTED"],
    IN_REVIEW: ["APPROVED", "QUOTED", "REJECTED"],
    APPROVED: ["QUOTED", "COMPLETED", "REJECTED"],
    QUOTED: ["QUOTED", "IN_PROGRESS", "DECLINED", "REJECTED"],
    IN_PROGRESS: ["CANCELLED", "COMPLETED"],
    DECLINED: [],
    REJECTED: [],
    CANCELLED: [],
    COMPLETED: [],
  };
  return transitions[current].includes(next);
}

export function requiresEquipmentWorkshopOperatorNote(
  status: EquipmentWorkshopRequestStatus,
): boolean {
  return status === "REJECTED" || status === "CANCELLED" || status === "COMPLETED";
}

export function getEquipmentWorkshopComputedStatus(
  status: EquipmentWorkshopRequestStatus,
  readyAt: Date | string | undefined,
  now = new Date(),
): EquipmentWorkshopComputedStatus {
  if (status !== "IN_PROGRESS" || !readyAt) return status;
  const date = readyAt instanceof Date ? readyAt : new Date(readyAt);
  return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime()
    ? "READY"
    : status;
}

export function resolveEquipmentWorkshopSpecialist(input: {
  category?: ItemCategory;
  tags?: readonly string[];
}): EquipmentWorkshopSpecialist {
  const tags = (input.tags ?? []).join(" ").toLowerCase();
  if (/냉병기|근접무기|아케론|melee|blade|sword|katana|dagger/.test(tags)) return "TEMPER";
  if (/화기|총기|토와스키|firearm|rifle|pistol|shotgun/.test(tags)) return "TOWASKI";
  if (/신체증강|증강체|생체|augmentation|cyber/.test(tags)) return "SUTURE";
  if (/전략장비|차량|드론|항공|strategic|vehicle|drone/.test(tags)) return "RATCHET";
  return "VERNIER";
}

export function isSameEquipmentWorkshopRequestPayload(
  left: Pick<EquipmentWorkshopRequestInput, "kind" | "details" | "inventoryEntryId">,
  right: Pick<EquipmentWorkshopRequestInput, "kind" | "details" | "inventoryEntryId">,
): boolean {
  return left.kind === right.kind && left.details === right.details && left.inventoryEntryId === right.inventoryEntryId;
}

export function parseEquipmentWorkshopRequest(body: unknown): EquipmentWorkshopRequestValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "요청 형식이 올바르지 않습니다." };
  }
  const source = body as Record<string, unknown>;
  const kind = source.kind;
  if (kind !== "upgrade" && kind !== "custom" && kind !== "reload") return { ok: false, error: "지원하지 않는 공방 요청입니다." };
  if (kind === "reload") {
    const inventoryEntryId = typeof source.inventoryEntryId === "string" ? source.inventoryEntryId.trim() : "";
    if (!inventoryEntryId) return { ok: false, error: "재장전할 장착 장비를 선택해 주세요." };
    return {
      ok: true,
      input: { kind, details: WORKSHOP_RELOAD_REQUEST_DETAILS, inventoryEntryId },
    };
  }
  const details = typeof source.details === "string" ? source.details.trim() : "";
  if (details.length < WORKSHOP_REQUEST_DETAIL_MIN_LENGTH) return { ok: false, error: `요청 내용을 ${WORKSHOP_REQUEST_DETAIL_MIN_LENGTH}자 이상 입력해 주세요.` };
  if (details.length > WORKSHOP_REQUEST_DETAIL_MAX_LENGTH) return { ok: false, error: `요청 내용은 ${WORKSHOP_REQUEST_DETAIL_MAX_LENGTH}자 이하여야 합니다.` };
  if (kind === "upgrade") {
    const inventoryEntryId = typeof source.inventoryEntryId === "string" ? source.inventoryEntryId.trim() : "";
    if (!inventoryEntryId) return { ok: false, error: "강화할 장착 장비를 선택해 주세요." };
    return { ok: true, input: { kind, details, inventoryEntryId } };
  }
  return { ok: true, input: { kind, details } };
}

function isEquipmentWorkshopSpecialist(
  value: unknown,
): value is EquipmentWorkshopSpecialist {
  return EQUIPMENT_WORKSHOP_SPECIALISTS.includes(
    String(value) as EquipmentWorkshopSpecialist,
  );
}

export function getEquipmentWorkshopUserTags(
  tags: readonly string[],
  characterCodename: string,
): string[] {
  const reserved = new Set<string>([
    "공방개조",
    "공방제작",
    ...EQUIPMENT_WORKSHOP_SPECIALISTS,
    characterCodename,
  ]);
  return tags.filter((tag) => !reserved.has(tag));
}

export function buildEquipmentWorkshopResultTags(input: {
  tags: readonly string[];
  kind: "upgrade" | "custom";
  specialistWorkflow: readonly EquipmentWorkshopSpecialistStep[];
  characterCodename: string;
}): string[] {
  return [
    ...new Set([
      ...getEquipmentWorkshopUserTags(input.tags, input.characterCodename),
      input.kind === "upgrade" ? "공방개조" : "공방제작",
      ...input.specialistWorkflow.map((step) => step.specialistCodename),
      input.characterCodename,
    ]),
  ];
}

function isEquipmentWorkshopModificationDomain(
  value: unknown,
): value is EquipmentWorkshopModificationDomain {
  return ["GENERAL", "ENERGY_EXPLOSIVE_OUTPUT", "BIO_REGEN_REPAIR"].includes(
    String(value),
  );
}

function parseEquipmentWorkshopSpecialistWorkflow(
  value: unknown,
): EquipmentWorkshopSpecialistStep[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    return null;
  }
  const seen = new Set<EquipmentWorkshopSpecialist>();
  const workflow: EquipmentWorkshopSpecialistStep[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const step = raw as Record<string, unknown>;
    const specialistCodename = step.specialistCodename;
    const task = typeof step.task === "string" ? step.task.trim() : "";
    if (
      !isEquipmentWorkshopSpecialist(specialistCodename) ||
      seen.has(specialistCodename) ||
      !task ||
      task.length > 120
    ) {
      return null;
    }
    seen.add(specialistCodename);
    workflow.push({ specialistCodename, task });
  }
  return workflow;
}

function parseEquipmentActionDamage(
  value: unknown,
): EquipmentAction["damage"] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const damageType = source.type;
  const amount = source.amount;
  const ignoresDefense = source.ignoresDefense;
  const scaling = source.scaling;
  if (
    !["PHYSICAL", "FIRE", "PSYCHIC"].includes(String(damageType)) ||
    !Number.isSafeInteger(amount) ||
    Number(amount) < 1 ||
    Number(amount) > 999 ||
    (ignoresDefense !== undefined && typeof ignoresDefense !== "boolean") ||
    scaling !== "NONE"
  ) {
    return null;
  }
  return {
    type: damageType as NonNullable<EquipmentAction["damage"]>["type"],
    amount: Number(amount),
    ...(ignoresDefense === true ? { ignoresDefense: true } : {}),
    scaling,
  };
}

function parseEquipmentAction(value: unknown): EquipmentAction | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const code = typeof source.code === "string" ? source.code.trim().toUpperCase() : "";
  const name = typeof source.name === "string" ? source.name.trim() : "";
  const description = typeof source.description === "string" ? source.description.trim() : "";
  const effect = typeof source.effect === "string" ? source.effect.trim() : "";
  const actionCost = source.actionCost;
  const chargeCost = source.chargeCost;
  const maxCharges = source.maxCharges;
  const reloadCreditCost = source.reloadCreditCost;
  const kind = source.kind ?? "CHARGED";
  const reloadable = source.reloadable ?? true;
  const requiresMounted = source.requiresMounted;
  const consumesRegularAmmo = source.consumesRegularAmmo;
  const rangeMinCells = source.rangeMinCells;
  const rangeMaxCells = source.rangeMaxCells;
  const usesWeaponAttack = source.usesWeaponAttack;
  const parsedDamage = parseEquipmentActionDamage(source.damage);
  const parsedAdditionalDamage = parseEquipmentActionDamage(
    source.additionalDamage,
  );
  const rawConsumableCost = source.consumableCost;
  let consumableCost: EquipmentAction["consumableCost"];
  if (rawConsumableCost !== undefined) {
    if (
      !rawConsumableCost ||
      typeof rawConsumableCost !== "object" ||
      Array.isArray(rawConsumableCost)
    ) {
      return null;
    }
    const cost = rawConsumableCost as Record<string, unknown>;
    const slug = typeof cost.slug === "string" ? cost.slug.trim() : "";
    if (
      !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug) ||
      !Number.isSafeInteger(cost.quantity) ||
      Number(cost.quantity) < 1 ||
      Number(cost.quantity) > 99
    ) {
      return null;
    }
    consumableCost = {
      slug,
      quantity: Number(cost.quantity),
    };
  }
  if (
    !/^U[1-9][0-9]?$/.test(code) ||
    !name || name.length > 80 ||
    !description || description.length > 500 ||
    !effect || effect.length > 1000 ||
    actionCost !== 1 ||
    (kind !== "CHARGED" && kind !== "STANCE" && kind !== "CONSUMABLE") ||
    typeof reloadable !== "boolean" ||
    (requiresMounted !== undefined && typeof requiresMounted !== "boolean") ||
    (usesWeaponAttack !== undefined && typeof usesWeaponAttack !== "boolean") ||
    (consumesRegularAmmo !== undefined &&
      (!Number.isSafeInteger(consumesRegularAmmo) || Number(consumesRegularAmmo) < 0 || Number(consumesRegularAmmo) > 99)) ||
    ((rangeMinCells === undefined) !== (rangeMaxCells === undefined)) ||
    (rangeMinCells !== undefined &&
      (!Number.isSafeInteger(rangeMinCells) ||
        !Number.isSafeInteger(rangeMaxCells) ||
        Number(rangeMinCells) < 0 ||
        Number(rangeMaxCells) < Number(rangeMinCells) ||
        Number(rangeMaxCells) > 99)) ||
    !Number.isSafeInteger(chargeCost) ||
    !Number.isSafeInteger(maxCharges) ||
    (kind === "CHARGED" &&
      (Number(chargeCost) < 1 || Number(maxCharges) < Number(chargeCost) || Number(maxCharges) > 99)) ||
    ((kind === "STANCE" || kind === "CONSUMABLE") &&
      (Number(chargeCost) !== 0 || Number(maxCharges) !== 0 || reloadable)) ||
    typeof reloadCreditCost !== "number" || !Number.isFinite(reloadCreditCost) ||
    reloadCreditCost < 0 || Number(reloadCreditCost.toFixed(2)) !== reloadCreditCost ||
    ((kind === "STANCE" || kind === "CONSUMABLE") && reloadCreditCost !== 0) ||
    parsedDamage === null ||
    parsedAdditionalDamage === null ||
    (kind === "CONSUMABLE") !== Boolean(consumableCost) ||
    (parsedAdditionalDamage !== undefined && usesWeaponAttack !== true) ||
    (usesWeaponAttack === true && rangeMinCells === undefined) ||
    source.reloadApproval !== "GM"
  ) {
    return null;
  }
  return {
    code,
    name,
    description,
    effect,
    actionCost: Number(actionCost),
    chargeCost: Number(chargeCost),
    maxCharges: Number(maxCharges),
    reloadCreditCost,
    reloadApproval: "GM",
    ...(kind !== "CHARGED" ? { kind } : {}),
    ...(reloadable === false ? { reloadable } : {}),
    ...(requiresMounted !== undefined ? { requiresMounted } : {}),
    ...(consumesRegularAmmo !== undefined
      ? { consumesRegularAmmo: Number(consumesRegularAmmo) }
      : {}),
    ...(rangeMinCells !== undefined
      ? {
          rangeMinCells: Number(rangeMinCells),
          rangeMaxCells: Number(rangeMaxCells),
        }
      : {}),
    ...(parsedDamage ? { damage: parsedDamage } : {}),
    ...(usesWeaponAttack !== undefined ? { usesWeaponAttack } : {}),
    ...(parsedAdditionalDamage
      ? { additionalDamage: parsedAdditionalDamage }
      : {}),
    ...(consumableCost ? { consumableCost } : {}),
  };
}

function parseEquipmentActions(
  value: unknown,
): EquipmentAction[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) return null;
  const actions: EquipmentAction[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const action = parseEquipmentAction(raw);
    if (
      !action ||
      seen.has(action.code) ||
      ((action.kind ?? "CHARGED") === "CHARGED" &&
        action.reloadable !== false)
    ) {
      return null;
    }
    seen.add(action.code);
    actions.push(action);
  }
  return actions;
}

function parseEquipmentCombatProfile(
  value: unknown,
): EquipmentCombatProfile | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const ammoCapacity = source.ammoCapacity;
  const mount = source.mount;
  const weaponAttack = source.weaponAttack;
  if (
    ammoCapacity !== undefined &&
    (!Number.isSafeInteger(ammoCapacity) || Number(ammoCapacity) < 1 || Number(ammoCapacity) > 999)
  ) {
    return null;
  }
  let parsedMount: EquipmentCombatProfile["mount"];
  if (mount !== undefined) {
    if (!mount || typeof mount !== "object" || Array.isArray(mount)) return null;
    const mountSource = mount as Record<string, unknown>;
    if (
      !Number.isSafeInteger(mountSource.mountActionCost) ||
      Number(mountSource.mountActionCost) !== 1 ||
      !Number.isSafeInteger(mountSource.unmountActionCost) ||
      Number(mountSource.unmountActionCost) !== 1 ||
      typeof mountSource.blocksMovement !== "boolean" ||
      typeof mountSource.allowsDiagonalFire !== "boolean" ||
      (mountSource.diagonalFireRequiresMounted !== undefined &&
        typeof mountSource.diagonalFireRequiresMounted !== "boolean") ||
      (mountSource.mountedRangeShape !== undefined &&
        mountSource.mountedRangeShape !== "DIAMOND") ||
      !Number.isSafeInteger(mountSource.bonusDamage) ||
      Number(mountSource.bonusDamage) < 0 ||
      Number(mountSource.bonusDamage) > 999
    ) {
      return null;
    }
    parsedMount = {
      mountActionCost: Number(mountSource.mountActionCost),
      unmountActionCost: Number(mountSource.unmountActionCost),
      blocksMovement: mountSource.blocksMovement,
      allowsDiagonalFire: mountSource.allowsDiagonalFire,
      ...(mountSource.diagonalFireRequiresMounted === true
        ? { diagonalFireRequiresMounted: true }
        : {}),
      ...(mountSource.mountedRangeShape === "DIAMOND"
        ? { mountedRangeShape: "DIAMOND" as const }
        : {}),
      bonusDamage: Number(mountSource.bonusDamage),
    };
  }
  let parsedWeaponAttack: EquipmentCombatProfile["weaponAttack"];
  if (weaponAttack !== undefined) {
    if (!weaponAttack || typeof weaponAttack !== "object" || Array.isArray(weaponAttack)) {
      return null;
    }
    const attack = weaponAttack as Record<string, unknown>;
    const weaponCategory =
      typeof attack.weaponCategory === "string"
        ? attack.weaponCategory.trim()
        : "";
    const rangeMinCells = attack.rangeMinCells;
    const rangeMaxCells = attack.rangeMaxCells;
    const usesCharacterAttack = attack.usesCharacterAttack;
    const consumesRegularAmmo = attack.consumesRegularAmmo;
    const damageByRange = attack.damageByRange;
    if (
      !weaponCategory ||
      weaponCategory.length > 40 ||
      !Number.isSafeInteger(rangeMinCells) ||
      !Number.isSafeInteger(rangeMaxCells) ||
      Number(rangeMinCells) < 0 ||
      Number(rangeMaxCells) < Number(rangeMinCells) ||
      Number(rangeMaxCells) > 99 ||
      usesCharacterAttack !== false ||
      !Number.isSafeInteger(consumesRegularAmmo) ||
      Number(consumesRegularAmmo) < 1 ||
      Number(consumesRegularAmmo) > 99 ||
      !Array.isArray(damageByRange) ||
      damageByRange.length < 1 ||
      damageByRange.length > 10
    ) {
      return null;
    }
    const parsedBands: NonNullable<
      EquipmentCombatProfile["weaponAttack"]
    >["damageByRange"] = [];
    let nextExpectedCell = Number(rangeMinCells);
    for (const rawBand of damageByRange) {
      if (!rawBand || typeof rawBand !== "object" || Array.isArray(rawBand)) {
        return null;
      }
      const band = rawBand as Record<string, unknown>;
      const minCells = band.minCells;
      const maxCells = band.maxCells;
      const damage = parseEquipmentActionDamage(band.damage);
      if (
        !Number.isSafeInteger(minCells) ||
        !Number.isSafeInteger(maxCells) ||
        Number(minCells) !== nextExpectedCell ||
        Number(maxCells) < Number(minCells) ||
        Number(maxCells) > Number(rangeMaxCells) ||
        !damage
      ) {
        return null;
      }
      parsedBands.push({
        minCells: Number(minCells),
        maxCells: Number(maxCells),
        damage,
      });
      nextExpectedCell = Number(maxCells) + 1;
    }
    if (nextExpectedCell !== Number(rangeMaxCells) + 1) return null;
    if (
      ammoCapacity === undefined ||
      Number(consumesRegularAmmo) > Number(ammoCapacity)
    ) {
      return null;
    }
    parsedWeaponAttack = {
      weaponCategory,
      rangeMinCells: Number(rangeMinCells),
      rangeMaxCells: Number(rangeMaxCells),
      usesCharacterAttack,
      consumesRegularAmmo: Number(consumesRegularAmmo),
      damageByRange: parsedBands,
    };
  }
  if (ammoCapacity === undefined && !parsedMount && !parsedWeaponAttack) return null;
  return {
    ...(ammoCapacity !== undefined ? { ammoCapacity: Number(ammoCapacity) } : {}),
    ...(parsedMount ? { mount: parsedMount } : {}),
    ...(parsedWeaponAttack ? { weaponAttack: parsedWeaponAttack } : {}),
  };
}

function parseEquipmentAbilityOverrides(
  value: unknown,
): EquipmentAbilityOverride[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 11) return null;

  const seen = new Set<string>();
  const overrides: EquipmentAbilityOverride[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const source = raw as Record<string, unknown>;
    const targetCode =
      typeof source.targetCode === "string" ? source.targetCode.trim() : "";
    const effect = typeof source.effect === "string" ? source.effect.trim() : "";
    if (
      !targetCode ||
      targetCode.length > 40 ||
      !effect ||
      effect.length > 1000 ||
      seen.has(targetCode)
    ) {
      return null;
    }
    seen.add(targetCode);
    overrides.push({ targetCode, effect });
  }
  return overrides.length > 0 ? overrides : undefined;
}

function optionalText(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length <= max ? text || undefined : null;
}

export function parseEquipmentWorkshopQuote(body: unknown): EquipmentWorkshopQuoteValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "견적 형식이 올바르지 않습니다." };
  const source = body as Record<string, unknown>;
  const result = source.result as Record<string, unknown> | undefined;
  const expectedVersion = source.expectedVersion;
  const creditCost = source.creditCost;
  const durationMinutes = source.durationMinutes;
  const specialistCodename = source.specialistCodename;
  const specialistWorkflow = parseEquipmentWorkshopSpecialistWorkflow(
    source.specialistWorkflow,
  );
  const modificationDomain = source.modificationDomain ?? "GENERAL";
  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0) return { ok: false, error: "견적 버전이 올바르지 않습니다." };
  if (typeof creditCost !== "number" || !Number.isFinite(creditCost) || creditCost < 0 || Number(creditCost.toFixed(2)) !== creditCost) return { ok: false, error: "크레딧은 0 이상, 소수점 둘째 자리까지 입력해 주세요." };
  if (!Number.isInteger(durationMinutes) || Number(durationMinutes) < WORKSHOP_QUOTE_MIN_DURATION_MINUTES || Number(durationMinutes) > WORKSHOP_QUOTE_MAX_DURATION_MINUTES) return { ok: false, error: "제작 시간은 1,440~43,200분(1~30일)이어야 합니다." };
  if (specialistCodename !== undefined && !isEquipmentWorkshopSpecialist(specialistCodename)) return { ok: false, error: "주 담당 specialist가 올바르지 않습니다." };
  if (specialistWorkflow === null) return { ok: false, error: "담당 공정은 서로 다른 담당자 1~5명과 각 담당 업무를 입력해 주세요." };
  if (
    specialistWorkflow &&
    specialistCodename &&
    specialistWorkflow[0]?.specialistCodename !== specialistCodename
  ) {
    return { ok: false, error: "주 담당자는 담당 공정의 첫 번째 담당자와 같아야 합니다." };
  }
  if (!isEquipmentWorkshopModificationDomain(modificationDomain)) return { ok: false, error: "개조 계통이 올바르지 않습니다." };
  if (!result || typeof result.name !== "string" || !result.name.trim() || result.name.trim().length > 80) return { ok: false, error: "결과 장비 이름은 1~80자여야 합니다." };
  if (typeof result.description !== "string" || !result.description.trim() || result.description.trim().length > 500) return { ok: false, error: "결과 장비 설명은 1~500자여야 합니다." };
  const damage = optionalText(result.damage, 80);
  const effect = optionalText(result.effect, 120);
  const previewImage = optionalText(result.previewImage, 500);
  const specialistNote = optionalText(source.specialistNote, 200);
  const internalNote = optionalText(source.internalNote, 1000);
  const equipmentAction = parseEquipmentAction(result.equipmentAction);
  const equipmentActions = parseEquipmentActions(result.equipmentActions);
  const combatProfile = parseEquipmentCombatProfile(result.combatProfile);
  const equipmentAbilityOverrides = parseEquipmentAbilityOverrides(
    result.equipmentAbilityOverrides,
  );
  if (damage === null || effect === null || previewImage === null || specialistNote === null || internalNote === null) return { ok: false, error: "견적의 선택 입력값 길이가 올바르지 않습니다." };
  if (equipmentAction === null) return { ok: false, error: "장비 액션은 U 코드, 설명, 효과, 액션·충전 비용, 최대 충전과 GM 재장전 비용을 확인해 주세요." };
  if (equipmentActions === null || (equipmentAction && equipmentActions)) return { ok: false, error: "복수 장비 액션은 재장전 불가 상태의 서로 다른 U 코드 1~5개이며 단일 액션과 함께 입력할 수 없습니다." };
  if (combatProfile === null) return { ok: false, error: "장비 탄창·거치 규칙을 확인해 주세요." };
  if (equipmentAbilityOverrides === null) return { ok: false, error: "어빌리티 강화는 중복되지 않은 대상 코드와 1~1,000자의 효과를 최대 11개까지 입력해 주세요." };
  if (previewImage && !previewImage.startsWith("/assets/") && !/^https:\/\//i.test(previewImage)) return { ok: false, error: "이미지는 /assets 경로 또는 HTTPS URL이어야 합니다." };
  const rawTags = Array.isArray(result.tags) ? result.tags : [];
  const tags = rawTags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean);
  if (tags.length > 20 || tags.some((tag) => tag.length > 40) || tags.length !== rawTags.length) return { ok: false, error: "태그는 40자 이하 문자열 20개까지 입력할 수 있습니다." };
  if (!Array.isArray(source.materials)) return { ok: false, error: "재료 목록이 올바르지 않습니다." };
  const category = result.category;
  if (category !== undefined && category !== "WEAPON" && category !== "ARMOR") {
    return { ok: false, error: "결과 장비 분류는 무기 또는 방어구여야 합니다." };
  }
  const blueprintRefSource = source.blueprintRef;
  let blueprintRef: EquipmentWorkshopBlueprintRef | undefined;
  if (blueprintRefSource !== undefined) {
    if (!blueprintRefSource || typeof blueprintRefSource !== "object" || Array.isArray(blueprintRefSource)) {
      return { ok: false, error: "설계안 참조가 올바르지 않습니다." };
    }
    const ref = blueprintRefSource as Record<string, unknown>;
    const id = typeof ref.id === "string" ? ref.id.trim() : "";
    const slug = typeof ref.slug === "string" ? ref.slug.trim() : "";
    const version = ref.version;
    if (!/^[a-f0-9]{24}$/i.test(id) || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug) || !Number.isInteger(version) || Number(version) < 1) {
      return { ok: false, error: "설계안 ID, slug 또는 버전이 올바르지 않습니다." };
    }
    blueprintRef = { id, slug, version: Number(version) };
  }
  const materials: EquipmentWorkshopQuoteInput["materials"] = [];
  const seen = new Set<string>();
  for (const raw of source.materials) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "재료 항목이 올바르지 않습니다." };
    const material = raw as Record<string, unknown>;
    const itemId = typeof material.itemId === "string" ? material.itemId.trim() : "";
    const slug = typeof material.slug === "string" ? material.slug.trim() : "";
    const quantity = material.quantity;
    const scope = material.scope ?? "CHARACTER";
    const key = `${scope}:${slug ? `slug:${slug}` : `id:${itemId}`}`;
    if (
      (scope !== "CHARACTER" && scope !== "SHARED") ||
      (Boolean(itemId) === Boolean(slug)) ||
      (itemId && !/^[a-f0-9]{24}$/i.test(itemId)) ||
      (slug && !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug)) ||
      !Number.isInteger(quantity) ||
      Number(quantity) < 1 ||
      Number(quantity) > WORKSHOP_QUOTE_MAX_MATERIAL_QUANTITY ||
      seen.has(key)
    ) return { ok: false, error: "재료 slug·ID·수량 또는 중복 항목을 확인해 주세요." };
    seen.add(key);
    materials.push({
      ...(slug ? { slug } : { itemId }),
      ...(scope === "SHARED" ? { scope } : {}),
      quantity: Number(quantity),
    });
  }
  let approvalGate: EquipmentWorkshopQuoteInput["approvalGate"];
  if (source.approvalGate !== undefined) {
    if (
      !source.approvalGate ||
      typeof source.approvalGate !== "object" ||
      Array.isArray(source.approvalGate)
    ) {
      return { ok: false, error: "조건부 표결 설정이 올바르지 않습니다." };
    }
    const gate = source.approvalGate as Record<string, unknown>;
    const presetKey = optionalText(gate.presetKey, 120);
    const title = optionalText(gate.title, 100);
    const content = optionalText(gate.content, 3_500);
    if (
      gate.mode !== "BUREAUCRAT_VOTE" ||
      presetKey === null ||
      title === null ||
      content === null ||
      !title ||
      !content ||
      (presetKey && !/^[a-z0-9][a-z0-9_-]{1,119}$/.test(presetKey)) ||
      !Array.isArray(gate.conditionalMaterials) ||
      !Array.isArray(gate.approvedOutputs) ||
      gate.conditionalMaterials.length > 200 ||
      gate.approvedOutputs.length < 1 ||
      gate.approvedOutputs.length > 50
    ) {
      return { ok: false, error: "조건부 표결의 제목·내용·재료·가결 산출물을 확인해 주세요." };
    }
    const conditionalMaterials: NonNullable<
      EquipmentWorkshopQuoteInput["approvalGate"]
    >["conditionalMaterials"] = [];
    const conditionalSeen = new Set<string>();
    for (const raw of gate.conditionalMaterials) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "조건부 재료 항목이 올바르지 않습니다." };
      }
      const material = raw as Record<string, unknown>;
      const itemId = typeof material.itemId === "string" ? material.itemId.trim() : "";
      const slug = typeof material.slug === "string" ? material.slug.trim() : "";
      const quantity = material.quantity;
      const scope = material.scope ?? "CHARACTER";
      const key = `${scope}:${slug ? `slug:${slug}` : `id:${itemId}`}`;
      if (
        (scope !== "CHARACTER" && scope !== "SHARED") ||
        (Boolean(itemId) === Boolean(slug)) ||
        (itemId && !/^[a-f0-9]{24}$/i.test(itemId)) ||
        (slug && !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug)) ||
        !Number.isInteger(quantity) ||
        Number(quantity) < 1 ||
        Number(quantity) > WORKSHOP_QUOTE_MAX_MATERIAL_QUANTITY ||
        seen.has(key) ||
        conditionalSeen.has(key)
      ) {
        return { ok: false, error: "조건부 재료 slug·ID·수량 또는 중복 항목을 확인해 주세요." };
      }
      conditionalSeen.add(key);
      conditionalMaterials.push({
        ...(slug ? { slug } : { itemId }),
        ...(scope === "SHARED" ? { scope } : {}),
        quantity: Number(quantity),
      });
    }
    const approvedOutputs: NonNullable<
      EquipmentWorkshopQuoteInput["approvalGate"]
    >["approvedOutputs"] = [];
    const outputSeen = new Set<string>();
    for (const raw of gate.approvedOutputs) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "가결 산출물 항목이 올바르지 않습니다." };
      }
      const output = raw as Record<string, unknown>;
      const slug = typeof output.slug === "string" ? output.slug.trim() : "";
      const scope = output.scope ?? "CHARACTER";
      const quantity = output.quantity;
      const key = `${scope}:${slug}`;
      if (
        !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug) ||
        (scope !== "CHARACTER" && scope !== "SHARED") ||
        !Number.isInteger(quantity) ||
        Number(quantity) < 1 ||
        Number(quantity) > 999 ||
        outputSeen.has(key)
      ) {
        return { ok: false, error: "가결 산출물 slug·지급 범위·수량 또는 중복 항목을 확인해 주세요." };
      }
      outputSeen.add(key);
      approvedOutputs.push({
        slug,
        ...(scope === "SHARED" ? { scope } : {}),
        quantity: Number(quantity),
      });
    }
    approvalGate = {
      mode: "BUREAUCRAT_VOTE",
      ...(presetKey ? { presetKey } : {}),
      title,
      content,
      conditionalMaterials,
      approvedOutputs,
    };
  }
  return {
    ok: true,
    input: {
      expectedVersion: Number(expectedVersion),
      creditCost,
      durationMinutes: Number(durationMinutes),
      ...(specialistCodename ? { specialistCodename } : {}),
      ...(specialistWorkflow ? { specialistWorkflow } : {}),
      ...(specialistNote ? { specialistNote } : {}),
      modificationDomain,
      materials,
      ...(approvalGate ? { approvalGate } : {}),
      ...(blueprintRef ? { blueprintRef } : {}),
      result: {
        ...(category ? { category } : {}),
        name: result.name.trim(),
        description: result.description.trim(),
        ...(damage ? { damage } : {}),
        ...(effect ? { effect } : {}),
        tags,
        ...(previewImage ? { previewImage } : {}),
        ...(equipmentAction ? { equipmentAction } : {}),
        ...(equipmentActions ? { equipmentActions } : {}),
        ...(combatProfile ? { combatProfile } : {}),
        ...(equipmentAbilityOverrides ? { equipmentAbilityOverrides } : {}),
      },
      ...(internalNote ? { internalNote } : {}),
    },
  };
}

export function getEquipmentWorkshopRequestLabel(kind: EquipmentWorkshopRequestKind): string {
  if (kind === "upgrade") return "장착 장비 강화 문의";
  if (kind === "reload") return "장비 액션 재장전 결재 요청";
  return "커스텀 장비 제작 의뢰";
}
