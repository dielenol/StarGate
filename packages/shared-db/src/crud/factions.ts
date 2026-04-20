/**
 * factions 컬렉션 CRUD
 */

import { ObjectId, type Filter, type WithId } from "mongodb";

import { factionsCol } from "../collections.js";
import {
  factionDocSchema,
  type FactionDoc,
} from "../schemas/faction.schema.js";

/* ── 상수 ── */

const ALLOWED_FACTION_FIELDS = new Set([
  "code",
  "slug",
  "label",
  "labelEn",
  "summary",
  "ideology",
  "relationships",
  "notableMembers",
  "tags",
  "isPublic",
  "loreMd",
  "source",
  "authorId",
  "authorName",
]);

// identity 필드는 upsertByCode에서 갱신 대상에서 제외 (code/slug 고정)
const UPSERT_IMMUTABLE_FIELDS = new Set(["code", "slug"]);

/* ── 타입 ── */

export type CreateFactionInput = Omit<
  FactionDoc,
  "_id" | "createdAt" | "updatedAt"
>;

/* ── 내부 유틸 ── */

function toObjectId(id: ObjectId | string): ObjectId | null {
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function pickAllowed(
  patch: Partial<FactionDoc>,
  exclude?: Set<string>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (!ALLOWED_FACTION_FIELDS.has(key)) continue;
    if (exclude?.has(key)) continue;
    sanitized[key] = (patch as Record<string, unknown>)[key];
  }
  return sanitized;
}

/* ── 조회 ── */

export async function getFactionById(
  id: ObjectId | string
): Promise<FactionDoc | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const col = await factionsCol();
  return col.findOne({ _id: oid });
}

export async function getFactionByCode(
  code: string
): Promise<FactionDoc | null> {
  const col = await factionsCol();
  return col.findOne({ code });
}

export async function getFactionBySlug(
  slug: string
): Promise<FactionDoc | null> {
  const col = await factionsCol();
  return col.findOne({ slug });
}

export async function listFactions(
  filter: Filter<FactionDoc> = {}
): Promise<FactionDoc[]> {
  const col = await factionsCol();
  return col.find(filter).sort({ code: 1 }).toArray();
}

/* ── 생성 ── */

export async function createFaction(
  input: CreateFactionInput
): Promise<FactionDoc> {
  const now = new Date();
  // Zod 검증: input + metadata가 factionDocSchema 전체 계약을 만족해야 한다
  const validated = factionDocSchema.parse({
    ...input,
    createdAt: now,
    updatedAt: now,
  });

  const col = await factionsCol();
  const result = await col.insertOne(validated as FactionDoc);
  return { ...validated, _id: result.insertedId } as FactionDoc;
}

/* ── 수정 ── */

export async function updateFaction(
  id: ObjectId | string,
  patch: Partial<FactionDoc>
): Promise<FactionDoc | null> {
  const oid = toObjectId(id);
  if (!oid) return null;

  const sanitized = pickAllowed(patch);
  if (Object.keys(sanitized).length === 0) return getFactionById(oid);

  const col = await factionsCol();
  return col.findOneAndUpdate(
    { _id: oid },
    { $set: { ...sanitized, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

/* ── 삭제 ── */

export async function deleteFaction(id: ObjectId | string): Promise<boolean> {
  const oid = toObjectId(id);
  if (!oid) return false;
  const col = await factionsCol();
  const result = await col.deleteOne({ _id: oid });
  return result.deletedCount > 0;
}

/* ── Upsert (seed용) ── */

export async function upsertFactionByCode(
  input: CreateFactionInput
): Promise<{ inserted: boolean; doc: FactionDoc }> {
  const existing = await getFactionByCode(input.code);

  if (!existing) {
    const doc = await createFaction(input);
    return { inserted: true, doc };
  }

  // code/slug는 identity로 고정, 나머지만 갱신
  // FactionDoc에는 _id 필드가 없지만 MongoDB driver는 항상 WithId<T>로 반환한다
  const patch = pickAllowed(input, UPSERT_IMMUTABLE_FIELDS);
  const existingWithId = existing as WithId<FactionDoc>;
  const updated = await updateFaction(existingWithId._id, patch);
  return { inserted: false, doc: updated ?? existing };
}
