import type { Document, IndexDescriptionInfo } from "mongodb";

export interface RequiredIndexSpec {
  collection: string;
  name: string;
  key: Record<string, 1 | -1>;
  unique?: boolean;
  partialFilterExpression?: Document;
  expireAfterSeconds?: number;
}

function orderedEntries(value: Document): Array<[string, unknown]> {
  return Object.entries(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function sameKeyOrder(
  expected: Record<string, 1 | -1>,
  actual: Document,
): boolean {
  const expectedEntries = orderedEntries(expected);
  const actualEntries = orderedEntries(actual);
  return (
    expectedEntries.length === actualEntries.length &&
    expectedEntries.every(
      ([key, direction], index) =>
        actualEntries[index]?.[0] === key &&
        actualEntries[index]?.[1] === direction,
    )
  );
}

function sameDocument(expected: unknown, actual: unknown): boolean {
  return (
    JSON.stringify(canonicalize(expected ?? null)) ===
    JSON.stringify(canonicalize(actual ?? null))
  );
}

/**
 * Compares the idempotency/performance options that the worker cutover
 * depends on. Index name alone is deliberately insufficient.
 */
export function compareIndexSpec(
  expected: RequiredIndexSpec,
  actual: IndexDescriptionInfo,
): string[] {
  const issues: string[] = [];

  if (!sameKeyOrder(expected.key, actual.key)) {
    issues.push("key");
  }
  if ((actual.unique === true) !== (expected.unique === true)) {
    issues.push("unique");
  }
  if (
    !sameDocument(
      expected.partialFilterExpression,
      actual.partialFilterExpression,
    )
  ) {
    issues.push("partialFilterExpression");
  }
  if (actual.expireAfterSeconds !== expected.expireAfterSeconds) {
    issues.push("expireAfterSeconds");
  }

  return issues;
}
