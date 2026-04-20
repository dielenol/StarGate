/**
 * institutions 컬렉션 CRUD
 */

import { ObjectId, type Filter, type WithId } from "mongodb";

import { institutionsCol } from "../collections.js";
import {
  institutionDocSchema,
  type InstitutionDoc,
} from "../schemas/institution.schema.js";

/* ── 상수 ── */

const ALLOWED_INSTITUTION_FIELDS = new Set([
  "code",
  "slug",
  "label",
  "labelEn",
  "parentFactionCode",
  "subUnits",
  "summary",
  "mission",
  "headquartersLocation",
  "leaderCodename",
  "relationships",
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

export type CreateInstitutionInput = Omit<
  InstitutionDoc,
  "_id" | "createdAt" | "updatedAt"
>;

/* ── 내부 유틸 ── */

function toObjectId(id: ObjectId | string): ObjectId | null {
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function pickAllowed(
  patch: Partial<InstitutionDoc>,
  exclude?: Set<string>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (!ALLOWED_INSTITUTION_FIELDS.has(key)) continue;
    if (exclude?.has(key)) continue;
    sanitized[key] = (patch as Record<string, unknown>)[key];
  }
  return sanitized;
}

/* ── 조회 ── */

export async function getInstitutionById(
  id: ObjectId | string
): Promise<InstitutionDoc | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const col = await institutionsCol();
  return col.findOne({ _id: oid });
}

export async function getInstitutionByCode(
  code: string
): Promise<InstitutionDoc | null> {
  const col = await institutionsCol();
  return col.findOne({ code });
}

export async function getInstitutionBySlug(
  slug: string
): Promise<InstitutionDoc | null> {
  const col = await institutionsCol();
  return col.findOne({ slug });
}

export async function listInstitutions(
  filter: Filter<InstitutionDoc> = {}
): Promise<InstitutionDoc[]> {
  const col = await institutionsCol();
  return col.find(filter).sort({ code: 1 }).toArray();
}

/* ── 생성 ── */

export async function createInstitution(
  input: CreateInstitutionInput
): Promise<InstitutionDoc> {
  const now = new Date();
  // Zod 검증: input + metadata가 institutionDocSchema 전체 계약을 만족해야 한다
  const validated = institutionDocSchema.parse({
    ...input,
    createdAt: now,
    updatedAt: now,
  });

  const col = await institutionsCol();
  const result = await col.insertOne(validated as InstitutionDoc);
  return { ...validated, _id: result.insertedId } as InstitutionDoc;
}

/* ── 수정 ── */

export async function updateInstitution(
  id: ObjectId | string,
  patch: Partial<InstitutionDoc>
): Promise<InstitutionDoc | null> {
  const oid = toObjectId(id);
  if (!oid) return null;

  const sanitized = pickAllowed(patch);
  if (Object.keys(sanitized).length === 0) return getInstitutionById(oid);

  const col = await institutionsCol();
  return col.findOneAndUpdate(
    { _id: oid },
    { $set: { ...sanitized, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

/* ── 삭제 ── */

export async function deleteInstitution(
  id: ObjectId | string
): Promise<boolean> {
  const oid = toObjectId(id);
  if (!oid) return false;
  const col = await institutionsCol();
  const result = await col.deleteOne({ _id: oid });
  return result.deletedCount > 0;
}

/* ── Upsert (seed용) ── */

export async function upsertInstitutionByCode(
  input: CreateInstitutionInput
): Promise<{ inserted: boolean; doc: InstitutionDoc }> {
  const existing = await getInstitutionByCode(input.code);

  if (!existing) {
    const doc = await createInstitution(input);
    return { inserted: true, doc };
  }

  // code/slug는 identity로 고정, 나머지만 갱신
  // InstitutionDoc에는 _id 필드가 없지만 MongoDB driver는 항상 WithId<T>로 반환한다
  const patch = pickAllowed(input, UPSERT_IMMUTABLE_FIELDS);
  const existingWithId = existing as WithId<InstitutionDoc>;
  const updated = await updateInstitution(existingWithId._id, patch);
  return { inserted: false, doc: updated ?? existing };
}
