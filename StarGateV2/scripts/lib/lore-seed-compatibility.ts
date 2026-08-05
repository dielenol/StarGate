import { createHash } from "node:crypto";

import type { ClientSession, Db, Document, MongoClient } from "mongodb";

type UnknownDocument = Record<string, unknown>;

export interface CharacterNestedDateRepair {
  set: Partial<
    Record<"lore.relations" | "lore.sessionAppearances", unknown[]>
  >;
}

export interface MasterItemNullableManagedRepair {
  unsetFields: Array<"damage" | "authorId" | "authorName">;
}

export interface SeedCompatibilityRepair {
  collection: "characters" | "master_items";
  id: Document["_id"];
  key: string;
  expectedUpdatedAt: unknown;
  set?: Record<string, unknown>;
  unsetFields?: string[];
}

function isRecord(value: unknown): value is UnknownDocument {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNestedUpdatedAt(values: unknown[]): {
  changed: boolean;
  values: unknown[];
} {
  let changed = false;
  const normalized = values.map((value) => {
    if (!isRecord(value) || !(value.updatedAt instanceof Date)) return value;
    changed = true;
    return { ...value, updatedAt: value.updatedAt.toISOString() };
  });
  return { changed, values: changed ? normalized : values };
}

/** BSON Date로 남은 dossier provenance를 schema-compatible ISO 문자열로 바꾼다. */
export function planCharacterNestedDateRepair(
  character: UnknownDocument,
): CharacterNestedDateRepair | null {
  if (!isRecord(character.lore)) return null;

  const set: CharacterNestedDateRepair["set"] = {};
  if (Array.isArray(character.lore.relations)) {
    const normalized = normalizeNestedUpdatedAt(character.lore.relations);
    if (normalized.changed) set["lore.relations"] = normalized.values;
  }
  if (Array.isArray(character.lore.sessionAppearances)) {
    const normalized = normalizeNestedUpdatedAt(character.lore.sessionAppearances);
    if (normalized.changed) {
      set["lore.sessionAppearances"] = normalized.values;
    }
  }

  return Object.keys(set).length > 0 ? { set } : null;
}

/** Optional managed fields의 legacy null은 값 발명 없이 field absence로 정규화한다. */
export function planMasterItemNullableManagedRepair(
  item: UnknownDocument,
): MasterItemNullableManagedRepair | null {
  const unsetFields = (["damage", "authorId", "authorName"] as const).filter(
    (field) => item[field] === null,
  );
  return unsetFields.length > 0 ? { unsetFields: [...unsetFields] } : null;
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

export function seedCompatibilityRepairSignature(
  repairs: SeedCompatibilityRepair[],
): string {
  const normalized = repairs.map((repair) => ({
    collection: repair.collection,
    id: String(repair.id),
    key: repair.key,
    expectedUpdatedAt: canonicalize(repair.expectedUpdatedAt),
    set: repair.set ? canonicalize(repair.set) : undefined,
    unsetFields: repair.unsetFields ? [...repair.unsetFields].sort() : undefined,
  }));
  normalized.sort((left, right) =>
    `${left.collection}:${left.key}:${left.id}`.localeCompare(
      `${right.collection}:${right.key}:${right.id}`,
    ),
  );
  return JSON.stringify(normalized);
}

export function seedCompatibilityRepairDigest(
  repairs: SeedCompatibilityRepair[],
): string {
  return createHash("sha256")
    .update(seedCompatibilityRepairSignature(repairs))
    .digest("hex");
}

function valueAtDottedPath(document: UnknownDocument, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    if (!isRecord(value)) return undefined;
    return value[part];
  }, document);
}

export function seedCompatibilityRepairPostconditionIssues(
  stored: UnknownDocument | null,
  repair: SeedCompatibilityRepair,
): string[] {
  if (!stored) return [`${repair.collection}.${repair.key}:target-missing`];
  const issues: string[] = [];
  for (const [field, expected] of Object.entries(repair.set ?? {})) {
    const actual = valueAtDottedPath(stored, field);
    if (JSON.stringify(canonicalize(actual)) !== JSON.stringify(canonicalize(expected))) {
      issues.push(`${repair.collection}.${repair.key}:${field}:postcondition-mismatch`);
    }
  }
  for (const field of repair.unsetFields ?? []) {
    if (Object.hasOwn(stored, field)) {
      issues.push(`${repair.collection}.${repair.key}:${field}:still-present`);
    }
  }
  if (!(stored.updatedAt instanceof Date)) {
    issues.push(`${repair.collection}.${repair.key}:updatedAt:not-date`);
  } else if (
    repair.expectedUpdatedAt !== undefined &&
    JSON.stringify(canonicalize(stored.updatedAt)) ===
      JSON.stringify(canonicalize(repair.expectedUpdatedAt))
  ) {
    issues.push(`${repair.collection}.${repair.key}:updatedAt:unchanged`);
  }
  return issues;
}

export async function applySeedCompatibilityRepairsInSession(
  db: Db,
  session: ClientSession,
  expectedRepairs: SeedCompatibilityRepair[],
  expectedPlanDigest: string,
  inspectRepairs: (
    session: ClientSession,
  ) => Promise<SeedCompatibilityRepair[]>,
): Promise<SeedCompatibilityRepair[]> {
  if (seedCompatibilityRepairDigest(expectedRepairs) !== expectedPlanDigest) {
    throw new Error("seed compatibility approved plan digest가 일치하지 않습니다.");
  }
  const currentRepairs = await inspectRepairs(session);
  if (seedCompatibilityRepairDigest(currentRepairs) !== expectedPlanDigest) {
    throw new Error("seed compatibility inspection/CAS snapshot이 변경되었습니다.");
  }
  for (const repair of currentRepairs) {
    const filter: Document = { _id: repair.id };
    filter.updatedAt = repair.expectedUpdatedAt === undefined
      ? { $exists: false }
      : repair.expectedUpdatedAt;
    const update: Document = { $currentDate: { updatedAt: true } };
    if (repair.set && Object.keys(repair.set).length > 0) update.$set = repair.set;
    if (repair.unsetFields && repair.unsetFields.length > 0) {
      update.$unset = Object.fromEntries(
        repair.unsetFields.map((field) => [field, ""]),
      );
    }
    const result = await db.collection(repair.collection).updateOne(
      filter,
      update,
      { session },
    );
    if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
      throw new Error(
        `seed compatibility repair CAS 실패: ${repair.collection}.${repair.key}`,
      );
    }
  }
  const afterRepairs = await inspectRepairs(session);
  if (afterRepairs.length > 0) {
    throw new Error(
      `seed compatibility repair 후 자동 보정 대상이 남았습니다: ${afterRepairs.length}`,
    );
  }
  return expectedRepairs;
}

/**
 * Driver-managed transaction callback 안에서 snapshot을 다시 확인하고 CAS write와
 * postflight를 수행한다. callback이 재시도돼도 매 attempt가 현재 snapshot부터
 * 다시 시작하므로 부분 성공을 전제로 하지 않는다.
 */
export async function applySeedCompatibilityRepairs(
  db: Db,
  client: MongoClient,
  expectedRepairs: SeedCompatibilityRepair[],
  expectedPlanDigest: string,
  inspectRepairs: (
    session: ClientSession,
  ) => Promise<SeedCompatibilityRepair[]>,
): Promise<SeedCompatibilityRepair[]> {
  if (seedCompatibilityRepairDigest(expectedRepairs) !== expectedPlanDigest) {
    throw new Error("seed compatibility approved plan digest가 일치하지 않습니다.");
  }
  if (expectedRepairs.length === 0) return [];
  const session = client.startSession();
  try {
    await session.withTransaction(() => applySeedCompatibilityRepairsInSession(
      db,
      session,
      expectedRepairs,
      expectedPlanDigest,
      inspectRepairs,
    ));
  } finally {
    await session.endSession();
  }
  return expectedRepairs;
}
