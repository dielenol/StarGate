/**
 * characters 컬렉션 CRUD
 */

import { ObjectId } from "mongodb";

import type {
  Character,
  CharacterType,
  CreateCharacterInput,
} from "../types/index.js";

import { charactersCol } from "../collections.js";

/* ── 조회 ── */

export async function listCharacters(): Promise<Character[]> {
  const col = await charactersCol();
  return col.find().sort({ type: 1, codename: 1 }).toArray();
}

export async function listCharactersByType(
  type: CharacterType
): Promise<Character[]> {
  const col = await charactersCol();
  return col.find({ type }).sort({ codename: 1 }).toArray();
}

export async function listPublicCharacters(): Promise<Character[]> {
  const col = await charactersCol();
  return col.find({ isPublic: true }).sort({ type: 1, codename: 1 }).toArray();
}

export async function listPublicCharactersByType(
  type: CharacterType
): Promise<Character[]> {
  const col = await charactersCol();
  return col
    .find({ isPublic: true, type })
    .sort({ codename: 1 })
    .toArray();
}

export async function findCharacterById(id: string): Promise<Character | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await charactersCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function findCharacterByCodename(
  codename: string
): Promise<Character | null> {
  const col = await charactersCol();
  return col.findOne({ codename });
}

export async function listCharactersByOwner(
  ownerId: string
): Promise<Pick<Character, "_id" | "agentLevel">[]> {
  const col = await charactersCol();
  return col
    .find({ ownerId })
    .project<Pick<Character, "_id" | "agentLevel">>({ agentLevel: 1 })
    .toArray();
}

/* ── 생성 ── */

export async function createCharacter(
  input: CreateCharacterInput
): Promise<Character> {
  const col = await charactersCol();
  const now = new Date();

  const doc = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  const result = await col.insertOne(doc as Character);
  return { ...doc, _id: result.insertedId } as Character;
}

/* ── 수정 ── */

const ALLOWED_CHARACTER_FIELDS = new Set([
  "codename",
  "type",
  "role",
  "agentLevel",
  "department",
  "previewImage",
  "pixelCharacterImage",
  "warningVideo",
  "ownerId",
  "isPublic",
  "source",
  "lore",
  "loreMd",
  "rawText",
  "sheet",
  "loreTags",
  "factionCode",
  "institutionCode",
  "appearsInEvents",
]);

export async function updateCharacter(
  id: string,
  update: Record<string, unknown>
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(update)) {
    if (ALLOWED_CHARACTER_FIELDS.has(key)) sanitized[key] = update[key];
  }
  if (Object.keys(sanitized).length === 0) return false;

  const col = await charactersCol();
  const result = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...sanitized, updatedAt: new Date() } as Record<string, unknown> }
  );
  return result.modifiedCount > 0;
}

/**
 * 특정 user 소유의 모든 character ownerId를 null로 해제한다.
 * 사용자 삭제 시 캐릭터 데이터는 보존하되 소유자만 끊기 위함.
 *
 * @returns matchedCount — ownerId === userId에 해당하는 도큐먼트 수
 */
export async function clearCharacterOwnerByUserId(
  userId: string
): Promise<{ matchedCount: number }> {
  const col = await charactersCol();
  const result = await col.updateMany(
    { ownerId: userId },
    { $set: { ownerId: null, updatedAt: new Date() } }
  );
  return { matchedCount: result.matchedCount };
}

/* ── 삭제 ── */

export async function deleteCharacter(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await charactersCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
