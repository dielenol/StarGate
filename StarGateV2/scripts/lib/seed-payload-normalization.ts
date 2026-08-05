function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u.test(value);
}

function shouldCoerceDate(path: string[], value: unknown): value is string {
  const key = path.at(-1) ?? "";
  const rootDocumentField =
    path.length === 1 ||
    (path.length === 2 &&
      path[0]?.startsWith("$") &&
      !key.includes("."));
  return (
    rootDocumentField &&
    typeof value === "string" &&
    looksLikeIsoDate(value) &&
    (key.endsWith("At") || key === "date")
  );
}

/**
 * Mongo root metadata dates become BSON Date values. Nested lore strings —
 * including dotted update paths — remain verbatim provenance/content.
 */
export function normalizeSeedPayloadDates(
  value: unknown,
  path: string[] = [],
): unknown {
  if (value instanceof Date) return value;
  if (shouldCoerceDate(path, value)) return new Date(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSeedPayloadDates(item, path));
  }
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = normalizeSeedPayloadDates(childValue, [
      ...path,
      childKey,
    ]);
  }
  return result;
}

/**
 * Mongo transaction은 파일 하나의 provenance/audit 단위로만 묶는다. 여러 파일을
 * 한 번에 실행하면 후반 실패가 앞선 commit을 남기므로 execute를 fail-closed한다.
 */
export function assertSingleFileExecutionScope(
  files: readonly string[],
  execute: boolean,
): void {
  if (!execute) return;
  const uniqueFiles = new Set(files);
  if (uniqueFiles.size !== 1) {
    throw new Error(
      "[seed-payload] WRITE는 파일 1개만 허용합니다. 전체 디렉터리는 dry-run 후 파일별로 실행·재개하세요.",
    );
  }
}

/** Add-only, sorted provenance ledger merge used by dry-run and write verification. */
export function mergeSeedProvenanceSourceIds(
  stored: unknown,
  sourceId: string,
  legacySourceId?: string,
): string[] {
  if (
    stored !== undefined &&
    (!Array.isArray(stored) || stored.some((value) => typeof value !== "string"))
  ) {
    throw new Error("provenanceSourceIds는 문자열 배열이어야 합니다.");
  }
  return [
    ...new Set([
      ...((stored as string[] | undefined) ?? []),
      ...(legacySourceId ? [legacySourceId] : []),
      sourceId,
    ]),
  ].sort();
}

/**
 * update+upsert insert는 Mongo update 뒤 runner의 `$currentDate`로 updatedAt을
 * 소유한다. Dry-run 완전 문서 검증에도 같은 필드를 합성해 write와 일치시킨다.
 */
export function withSeedRunnerInsertUpdatedAt<T extends Record<string, unknown>>(
  candidate: T | null,
  shouldInsert: boolean,
  now: Date = new Date(),
): T | null {
  if (!candidate || !shouldInsert || candidate.updatedAt !== undefined) {
    return candidate;
  }
  return { ...candidate, updatedAt: now };
}
