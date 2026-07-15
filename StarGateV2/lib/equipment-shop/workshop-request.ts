import type {
  EquipmentAction,
  EquipmentChargeState,
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
export const WORKSHOP_QUOTE_MAX_DURATION_MINUTES = 43_200;
export const WORKSHOP_QUOTE_MAX_MATERIAL_QUANTITY = 999;
export const WORKSHOP_RELOAD_REQUEST_DETAILS = "장착 장비 액션 재장전 승인 요청";

export const WORKSHOP_COST_POLICY = {
  utilityCreditRange: [200, 500],
  actionLaborRateRange: [0.2, 0.4],
  advancedCreditRange: [1_500, 2_200],
} as const;

export type EquipmentWorkshopRequestKind = "upgrade" | "custom" | "reload";
export type EquipmentWorkshopRequestStatus =
  (typeof EQUIPMENT_WORKSHOP_REQUEST_STATUSES)[number];
export type EquipmentWorkshopComputedStatus =
  | EquipmentWorkshopRequestStatus
  | "READY";
export type EquipmentWorkshopSpecialist =
  | "VERNIER"
  | "TEMPER"
  | "TOWASKI"
  | "SUTURE"
  | "RATCHET";
export type EquipmentWorkshopModificationDomain =
  | "GENERAL"
  | "ENERGY_EXPLOSIVE_OUTPUT"
  | "BIO_REGEN_REPAIR";

export interface EquipmentWorkshopMaterial {
  itemId: string;
  itemName: string;
  category: ItemCategory;
  quantity: number;
  unitPrice: number;
  subtotal: number;
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
  generation: number;
}

export interface EquipmentWorkshopQuote {
  version: number;
  creditCost: number;
  durationMinutes: number;
  specialistCodename: EquipmentWorkshopSpecialist;
  specialistNote?: string;
  modificationDomain: EquipmentWorkshopModificationDomain;
  materials: EquipmentWorkshopMaterial[];
  materialCost: number;
  totalCost: number;
  result: EquipmentWorkshopResultBlueprint;
  issuedAt: string;
  issuedById?: string;
  issuedByName?: string;
}

export interface EquipmentWorkshopEscrow {
  sourceItemId: string;
  sourceItemName: string;
  sourceSlot: EquipmentSlot;
  materials: EquipmentWorkshopMaterial[];
  creditCost: number;
  sourceEquipmentCharge?: EquipmentChargeState;
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
  specialistNote?: string;
  modificationDomain: EquipmentWorkshopModificationDomain;
  materials: Array<{ itemId: string; quantity: number }>;
  result: {
    name: string;
    description: string;
    damage?: string;
    effect?: string;
    tags?: string[];
    previewImage?: string;
    equipmentAction?: EquipmentAction;
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
  return ["VERNIER", "TEMPER", "TOWASKI", "SUTURE", "RATCHET"].includes(
    String(value),
  );
}

function isEquipmentWorkshopModificationDomain(
  value: unknown,
): value is EquipmentWorkshopModificationDomain {
  return ["GENERAL", "ENERGY_EXPLOSIVE_OUTPUT", "BIO_REGEN_REPAIR"].includes(
    String(value),
  );
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
  if (
    !/^U[1-9][0-9]?$/.test(code) ||
    !name || name.length > 80 ||
    !description || description.length > 500 ||
    !effect || effect.length > 1000 ||
    !Number.isSafeInteger(actionCost) || Number(actionCost) < 1 ||
    !Number.isSafeInteger(chargeCost) || Number(chargeCost) < 1 ||
    !Number.isSafeInteger(maxCharges) || Number(maxCharges) < Number(chargeCost) || Number(maxCharges) > 99 ||
    typeof reloadCreditCost !== "number" || !Number.isFinite(reloadCreditCost) ||
    reloadCreditCost < 0 || Number(reloadCreditCost.toFixed(2)) !== reloadCreditCost ||
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
  };
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
  const modificationDomain = source.modificationDomain ?? "GENERAL";
  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0) return { ok: false, error: "견적 버전이 올바르지 않습니다." };
  if (typeof creditCost !== "number" || !Number.isFinite(creditCost) || creditCost < 0 || Number(creditCost.toFixed(2)) !== creditCost) return { ok: false, error: "크레딧은 0 이상, 소수점 둘째 자리까지 입력해 주세요." };
  if (!Number.isInteger(durationMinutes) || Number(durationMinutes) < 1 || Number(durationMinutes) > WORKSHOP_QUOTE_MAX_DURATION_MINUTES) return { ok: false, error: "제작 시간은 1~43,200분이어야 합니다." };
  if (specialistCodename !== undefined && !isEquipmentWorkshopSpecialist(specialistCodename)) return { ok: false, error: "주 담당 specialist가 올바르지 않습니다." };
  if (!isEquipmentWorkshopModificationDomain(modificationDomain)) return { ok: false, error: "개조 계통이 올바르지 않습니다." };
  if (!result || typeof result.name !== "string" || !result.name.trim() || result.name.trim().length > 80) return { ok: false, error: "결과 장비 이름은 1~80자여야 합니다." };
  if (typeof result.description !== "string" || !result.description.trim() || result.description.trim().length > 500) return { ok: false, error: "결과 장비 설명은 1~500자여야 합니다." };
  const damage = optionalText(result.damage, 80);
  const effect = optionalText(result.effect, 120);
  const previewImage = optionalText(result.previewImage, 500);
  const specialistNote = optionalText(source.specialistNote, 200);
  const internalNote = optionalText(source.internalNote, 1000);
  const equipmentAction = parseEquipmentAction(result.equipmentAction);
  if (damage === null || effect === null || previewImage === null || specialistNote === null || internalNote === null) return { ok: false, error: "견적의 선택 입력값 길이가 올바르지 않습니다." };
  if (equipmentAction === null) return { ok: false, error: "장비 액션은 U 코드, 설명, 효과, 액션·충전 비용, 최대 충전과 GM 재장전 비용을 확인해 주세요." };
  if (previewImage && !previewImage.startsWith("/assets/") && !/^https:\/\//i.test(previewImage)) return { ok: false, error: "이미지는 /assets 경로 또는 HTTPS URL이어야 합니다." };
  const rawTags = Array.isArray(result.tags) ? result.tags : [];
  const tags = rawTags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean);
  if (tags.length > 20 || tags.some((tag) => tag.length > 40) || tags.length !== rawTags.length) return { ok: false, error: "태그는 40자 이하 문자열 20개까지 입력할 수 있습니다." };
  if (!Array.isArray(source.materials)) return { ok: false, error: "재료 목록이 올바르지 않습니다." };
  const materials: Array<{ itemId: string; quantity: number }> = [];
  const seen = new Set<string>();
  for (const raw of source.materials) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "재료 항목이 올바르지 않습니다." };
    const itemId = typeof (raw as Record<string, unknown>).itemId === "string" ? String((raw as Record<string, unknown>).itemId).trim() : "";
    const quantity = (raw as Record<string, unknown>).quantity;
    if (!/^[a-f0-9]{24}$/i.test(itemId) || !Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > WORKSHOP_QUOTE_MAX_MATERIAL_QUANTITY || seen.has(itemId)) return { ok: false, error: "재료 ID·수량 또는 중복 항목을 확인해 주세요." };
    seen.add(itemId);
    materials.push({ itemId, quantity: Number(quantity) });
  }
  return {
    ok: true,
    input: {
      expectedVersion: Number(expectedVersion),
      creditCost,
      durationMinutes: Number(durationMinutes),
      ...(specialistCodename ? { specialistCodename } : {}),
      ...(specialistNote ? { specialistNote } : {}),
      modificationDomain,
      materials,
      result: {
        name: result.name.trim(),
        description: result.description.trim(),
        ...(damage ? { damage } : {}),
        ...(effect ? { effect } : {}),
        tags,
        ...(previewImage ? { previewImage } : {}),
        ...(equipmentAction ? { equipmentAction } : {}),
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
