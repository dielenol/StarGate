export const WORKSHOP_REQUEST_DETAIL_MIN_LENGTH = 10;
export const WORKSHOP_REQUEST_DETAIL_MAX_LENGTH = 1000;

export type EquipmentWorkshopRequestKind = "upgrade" | "custom";

export interface EquipmentWorkshopRequestInput {
  kind: EquipmentWorkshopRequestKind;
  details: string;
  inventoryEntryId?: string;
}

export interface EquipmentWorkshopRequestResponse {
  ok: true;
  kind: EquipmentWorkshopRequestKind;
  message: string;
}

export type EquipmentWorkshopRequestValidation =
  | { ok: true; input: EquipmentWorkshopRequestInput }
  | { ok: false; error: string };

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
