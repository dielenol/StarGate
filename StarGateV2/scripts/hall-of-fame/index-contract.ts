import type {
  IndexDescription,
  IndexDescriptionInfo,
} from "mongodb";

export interface HonorIndexContractStatus {
  missing: string[];
  conflicting: string[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function orderedKey(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return JSON.stringify(Object.entries(value as Record<string, unknown>));
}

function optionsFingerprint(value: {
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: unknown;
  collation?: unknown;
  hidden?: boolean;
  expireAfterSeconds?: number;
  wildcardProjection?: unknown;
}): string {
  return stableJson({
    unique: value.unique === true,
    sparse: value.sparse === true,
    partialFilterExpression: value.partialFilterExpression ?? null,
    collation: value.collation ?? null,
    hidden: value.hidden === true,
    expireAfterSeconds: value.expireAfterSeconds ?? null,
    wildcardProjection: value.wildcardProjection ?? null,
  });
}

function matchesDefinition(
  current: IndexDescriptionInfo,
  desired: IndexDescription,
): boolean {
  return (
    orderedKey(current.key) === orderedKey(desired.key) &&
    optionsFingerprint(current) === optionsFingerprint(desired)
  );
}

/** 이름·key 순서·유일성/부분 인덱스 옵션까지 운영 계약과 정확히 비교한다. */
export function inspectHonorIndexContract(
  current: readonly IndexDescriptionInfo[],
  desired: readonly IndexDescription[],
): HonorIndexContractStatus {
  const missing: string[] = [];
  const conflicting: string[] = [];
  for (const definition of desired) {
    const name = String(definition.name ?? "");
    const byName = current.find((index) => index.name === name);
    if (byName) {
      if (!matchesDefinition(byName, definition)) conflicting.push(name);
      continue;
    }
    const sameKey = current.find(
      (index) =>
        index.name !== "_id_" &&
        orderedKey(index.key) === orderedKey(definition.key),
    );
    if (sameKey) conflicting.push(name);
    else missing.push(name);
  }
  return { missing, conflicting };
}
