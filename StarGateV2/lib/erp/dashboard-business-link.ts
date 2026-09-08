/**
 * 거래/연구는 ObjectId, 공방은 Idempotency-Key를 문자열 _id로 저장한다.
 * 공방 형식은 서버 lib/api/idempotency.ts의 8~128자 계약과 동일하다.
 */
export function parseDashboardBusinessRecordId(
  value: string | null,
  kind: "objectId" | "workshop" = "objectId",
): string | null {
  const candidate = value?.trim() ?? "";
  if (kind === "workshop") return /^[A-Za-z0-9:_-]{8,128}$/.test(candidate) ? candidate : null;
  return /^[a-f\d]{24}$/i.test(candidate) ? candidate.toLowerCase() : null;
}
