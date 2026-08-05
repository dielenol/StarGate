import type {
  Document,
  IndexDescription,
  IndexDescriptionInfo,
} from "mongodb";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function sameDocument(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function keyEntries(key: IndexDescription["key"]): Array<[string, unknown]> {
  return Object.entries(key instanceof Map ? Object.fromEntries(key) : key);
}

function expectedListIndexEntries(
  expected: IndexDescription["key"],
): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
  let emittedTextMetadata = false;
  for (const [field, direction] of keyEntries(expected)) {
    if (direction !== "text") {
      entries.push([field, direction]);
      continue;
    }
    if (!emittedTextMetadata) {
      entries.push(["_fts", "text"], ["_ftsx", 1]);
      emittedTextMetadata = true;
    }
  }
  return entries;
}

export function sameIndexKey(
  expected: IndexDescription["key"],
  actual: Document,
): boolean {
  return JSON.stringify(expectedListIndexEntries(expected)) ===
    JSON.stringify(Object.entries(actual));
}

function expectedTextWeights(expected: IndexDescription): Document | undefined {
  const fields = keyEntries(expected.key)
    .filter(([, direction]) => direction === "text")
    .map(([field]) => field);
  if (fields.length === 0) return expected.weights;
  const configured = expected.weights ?? {};
  return Object.fromEntries(
    fields.map((field) => [field, configured[field] ?? 1]),
  );
}

export function indexDefinitionIssues(
  expected: IndexDescription,
  actual: IndexDescriptionInfo,
): string[] {
  const issues: string[] = [];
  const textIndex = keyEntries(expected.key).some(
    ([, direction]) => direction === "text",
  );
  if (!sameIndexKey(expected.key, actual.key)) issues.push("key");
  if ((expected.unique === true) !== (actual.unique === true)) issues.push("unique");
  if ((expected.sparse === true) !== (actual.sparse === true)) issues.push("sparse");
  if (!sameDocument(expected.partialFilterExpression, actual.partialFilterExpression)) {
    issues.push("partialFilterExpression");
  }
  if (!sameDocument(expectedTextWeights(expected), actual.weights)) {
    issues.push("weights");
  }
  const expectedLanguage = textIndex
    ? expected.default_language ?? "english"
    : expected.default_language;
  if (expectedLanguage !== actual.default_language) {
    issues.push("default_language");
  }
  const expectedLanguageOverride = textIndex
    ? expected.language_override ?? "language"
    : expected.language_override;
  const actualLanguageOverride = textIndex
    ? actual.language_override ?? "language"
    : actual.language_override;
  if (expectedLanguageOverride !== actualLanguageOverride) {
    issues.push("language_override");
  }
  const expectedTextIndexVersion = textIndex
    ? expected.textIndexVersion ?? 3
    : expected.textIndexVersion;
  const actualTextIndexVersion = textIndex
    ? actual.textIndexVersion ?? 3
    : actual.textIndexVersion;
  if (expectedTextIndexVersion !== actualTextIndexVersion) {
    issues.push("textIndexVersion");
  }
  return issues;
}
