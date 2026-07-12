export const EQUIPMENT_WORKSHOP_REQUEST_STATUSES = [
  "REQUESTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
] as const;

export const WORKSHOP_REQUEST_DETAIL_MIN_LENGTH = 10;
export const WORKSHOP_REQUEST_DETAIL_MAX_LENGTH = 1000;

export type EquipmentWorkshopRequestKind = "upgrade" | "custom";
export type EquipmentWorkshopRequestStatus =
  (typeof EQUIPMENT_WORKSHOP_REQUEST_STATUSES)[number];

export interface SerializedEquipmentWorkshopRequest {
  _id: string;
  kind: EquipmentWorkshopRequestKind;
  userId: string;
  userName: string;
  characterId: string;
  characterCodename: string;
  inventoryEntryId?: string;
  equipmentName?: string;
  details: string;
  status: EquipmentWorkshopRequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedById?: string;
  reviewedByName?: string;
  operatorNote?: string;
  history?: Array<{
    status: EquipmentWorkshopRequestStatus;
    at: string;
    actorId: string;
    actorName: string;
    note?: string;
  }>;
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

export type EquipmentWorkshopRequestValidation =
  | { ok: true; input: EquipmentWorkshopRequestInput }
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
    REQUESTED: ["IN_REVIEW", "APPROVED", "REJECTED"],
    IN_REVIEW: ["APPROVED", "REJECTED"],
    APPROVED: ["COMPLETED", "REJECTED"],
    REJECTED: [],
    COMPLETED: [],
  };
  return transitions[current].includes(next);
}

export function requiresEquipmentWorkshopOperatorNote(
  status: EquipmentWorkshopRequestStatus,
): boolean {
  return status === "REJECTED" || status === "COMPLETED";
}

export function isSameEquipmentWorkshopRequestPayload(
  left: Pick<
    EquipmentWorkshopRequestInput,
    "kind" | "details" | "inventoryEntryId"
  >,
  right: Pick<
    EquipmentWorkshopRequestInput,
    "kind" | "details" | "inventoryEntryId"
  >,
): boolean {
  return (
    left.kind === right.kind &&
    left.details === right.details &&
    left.inventoryEntryId === right.inventoryEntryId
  );
}

export function parseEquipmentWorkshopRequest(
  body: unknown,
): EquipmentWorkshopRequestValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "요청 형식이 올바르지 않습니다." };
  }

  const source = body as Record<string, unknown>;
  const kind = source.kind;
  if (kind !== "upgrade" && kind !== "custom") {
    return { ok: false, error: "지원하지 않는 공방 요청입니다." };
  }

  const details = typeof source.details === "string" ? source.details.trim() : "";
  if (details.length < WORKSHOP_REQUEST_DETAIL_MIN_LENGTH) {
    return {
      ok: false,
      error: `요청 내용을 ${WORKSHOP_REQUEST_DETAIL_MIN_LENGTH}자 이상 입력해 주세요.`,
    };
  }
  if (details.length > WORKSHOP_REQUEST_DETAIL_MAX_LENGTH) {
    return {
      ok: false,
      error: `요청 내용은 ${WORKSHOP_REQUEST_DETAIL_MAX_LENGTH}자 이하여야 합니다.`,
    };
  }

  if (kind === "upgrade") {
    const inventoryEntryId =
      typeof source.inventoryEntryId === "string"
        ? source.inventoryEntryId.trim()
        : "";
    if (!inventoryEntryId) {
      return { ok: false, error: "강화할 장착 장비를 선택해 주세요." };
    }
    return { ok: true, input: { kind, details, inventoryEntryId } };
  }

  return { ok: true, input: { kind, details } };
}

export function getEquipmentWorkshopRequestLabel(
  kind: EquipmentWorkshopRequestKind,
): string {
  return kind === "upgrade" ? "장착 장비 강화 문의" : "커스텀 장비 제작 의뢰";
}
