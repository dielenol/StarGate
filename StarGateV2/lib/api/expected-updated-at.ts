export type ExpectedUpdatedAtResult =
  | { ok: true; value: Date | null }
  | { ok: false; error: string };

export function parseExpectedUpdatedAt(
  body: Record<string, unknown>,
): ExpectedUpdatedAtResult {
  if (!Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt")) {
    return {
      ok: false,
      error: "expectedUpdatedAt은 null 또는 ISO 날짜 문자열로 필요합니다.",
    };
  }

  const raw = body.expectedUpdatedAt;
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: "expectedUpdatedAt은 null 또는 ISO 날짜 문자열이어야 합니다.",
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return {
      ok: false,
      error: "expectedUpdatedAt 날짜 형식이 올바르지 않습니다.",
    };
  }
  return { ok: true, value: parsed };
}

export function isExpectedUpdatedAtCurrent(
  actual: unknown,
  expected: Date | null,
): boolean {
  if (expected === null) return actual === null || actual === undefined;
  const actualDate =
    actual instanceof Date
      ? actual
      : typeof actual === "string"
        ? new Date(actual)
        : null;
  return Boolean(
    actualDate &&
      !Number.isNaN(actualDate.getTime()) &&
      actualDate.getTime() === expected.getTime(),
  );
}
