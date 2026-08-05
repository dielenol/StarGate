export const SESSION_REPORT_REFERENCE_MAX_COUNT = 200;
export const SESSION_REPORT_REFERENCE_MAX_LENGTH = 160;

export const SESSION_REPORT_REFERENCE_FIELDS = [
  "relatedWikiSlugs",
  "relatedPersonnelCodenames",
  "relatedCatalogSlugs",
] as const;

export type SessionReportReferenceField =
  (typeof SESSION_REPORT_REFERENCE_FIELDS)[number];

export type SessionReportReferenceTextValues = Record<
  SessionReportReferenceField,
  string
>;

export type SessionReportReferenceValues = Record<
  SessionReportReferenceField,
  string[]
>;

const FIELD_LABELS: Record<SessionReportReferenceField, string> = {
  relatedWikiSlugs: "관련 위키 slug",
  relatedPersonnelCodenames: "관련 인물 codename",
  relatedCatalogSlugs: "관련 카탈로그 slug",
};

export type SessionReportReferenceValidation =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

export function validateSessionReportReferenceList(
  field: SessionReportReferenceField,
  value: unknown,
): SessionReportReferenceValidation {
  const label = FIELD_LABELS[field];
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label}은 문자열 배열이어야 합니다.` };
  }
  if (value.length > SESSION_REPORT_REFERENCE_MAX_COUNT) {
    return {
      ok: false,
      error: `${label}은 ${SESSION_REPORT_REFERENCE_MAX_COUNT}개까지 입력할 수 있습니다.`,
    };
  }

  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return { ok: false, error: `${label}은 문자열 배열이어야 합니다.` };
    }
    const text = entry.trim();
    if (!text || text.length > SESSION_REPORT_REFERENCE_MAX_LENGTH) {
      return {
        ok: false,
        error: `${label}의 각 값은 1~${SESSION_REPORT_REFERENCE_MAX_LENGTH}자여야 합니다.`,
      };
    }
    normalized.push(text);
  }

  if (new Set(normalized).size !== normalized.length) {
    return { ok: false, error: `${label}에 중복 값이 있습니다.` };
  }

  return { ok: true, value: normalized };
}

export function parseSessionReportReferenceText(
  field: SessionReportReferenceField,
  value: string,
): SessionReportReferenceValidation {
  const entries = value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return validateSessionReportReferenceList(field, entries);
}

export function parseSessionReportReferenceTexts(
  values: SessionReportReferenceTextValues,
):
  | { ok: true; value: SessionReportReferenceValues }
  | { ok: false; error: string } {
  const parsed = {} as SessionReportReferenceValues;
  for (const field of SESSION_REPORT_REFERENCE_FIELDS) {
    const result = parseSessionReportReferenceText(field, values[field]);
    if (!result.ok) return result;
    parsed[field] = result.value;
  }
  return { ok: true, value: parsed };
}

export function formatSessionReportReferenceText(
  value: readonly string[] | undefined,
): string {
  return value?.join("\n") ?? "";
}

export function emptySessionReportReferenceTexts(): SessionReportReferenceTextValues {
  return {
    relatedWikiSlugs: "",
    relatedPersonnelCodenames: "",
    relatedCatalogSlugs: "",
  };
}

export function formatSessionReportReferenceTexts(
  values: Partial<Record<SessionReportReferenceField, readonly string[]>>,
): SessionReportReferenceTextValues {
  return {
    relatedWikiSlugs: formatSessionReportReferenceText(
      values.relatedWikiSlugs,
    ),
    relatedPersonnelCodenames: formatSessionReportReferenceText(
      values.relatedPersonnelCodenames,
    ),
    relatedCatalogSlugs: formatSessionReportReferenceText(
      values.relatedCatalogSlugs,
    ),
  };
}
