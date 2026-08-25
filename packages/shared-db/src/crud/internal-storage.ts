const INTERNAL_SESSION_REPORT_REFERENCE_FIELDS = [
  "__sessionReportReferenceVersion",
  "__sessionReportReferenceLockAt",
  "__honorAnalysisLockAt",
] as const;

/**
 * Mongo transaction conflict용 내부 필드는 domain DTO와 API 응답에 포함하지 않는다.
 * legacy version 필드도 함께 제거해 이전 실행 흔적이 노출되지 않게 한다.
 */
export function withoutSessionReportReferenceStorageFields<T>(value: T): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (
    !INTERNAL_SESSION_REPORT_REFERENCE_FIELDS.some((field) =>
      Object.hasOwn(record, field),
    )
  ) {
    return value;
  }
  const sanitized = { ...record };
  for (const field of INTERNAL_SESSION_REPORT_REFERENCE_FIELDS) {
    delete sanitized[field];
  }
  return sanitized as T;
}

export function withoutSessionReportReferenceStorageFieldsMany<T>(
  values: readonly T[],
): T[] {
  return values.map(withoutSessionReportReferenceStorageFields);
}
