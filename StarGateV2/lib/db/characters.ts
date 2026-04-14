/**
 * characters 컬렉션 CRUD
 */

import { ObjectId } from "mongodb";

import type {
  Character,
  CharacterType,
  CreateCharacterInput,
} from "@/types/character";

import { charactersCollection } from "./collections";

/* ── 조회 ── */

export async function listCharacters(): Promise<Character[]> {
  const col = await charactersCollection();
  return col.find().sort({ type: 1, codename: 1 }).toArray();
}

export async function listCharactersByType(
  type: CharacterType,
): Promise<Character[]> {
  const col = await charactersCollection();
  return col.find({ type }).sort({ codename: 1 }).toArray();
}

export async function listPublicCharacters(): Promise<Character[]> {
  const col = await charactersCollection();
  return col
    .find({ isPublic: true })
    .sort({ type: 1, codename: 1 })
    .toArray();
}

export async function listPublicCharactersByType(
  type: CharacterType,
): Promise<Character[]> {
  const col = await charactersCollection();
  return col
    .find({ isPublic: true, type })
    .sort({ codename: 1 })
    .toArray();
}

export async function findCharacterById(
  id: string,
): Promise<Character | null> {
  const col = await charactersCollection();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function findCharacterByCodename(
  codename: string,
): Promise<Character | null> {
  const col = await charactersCollection();
  return col.findOne({ codename });
}

/* ── 생성 ── */

export async function createCharacter(
  input: CreateCharacterInput,
): Promise<Character> {
  const col = await charactersCollection();
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
  "codename", "type", "role", "previewImage", "pixelCharacterImage",
  "warningVideo", "ownerId", "isPublic", "sheet",
]);

export async function updateCharacter(
  id: string,
  update: Record<string, unknown>,
): Promise<boolean> {
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(update)) {
    if (ALLOWED_CHARACTER_FIELDS.has(key)) sanitized[key] = update[key];
  }
  if (Object.keys(sanitized).length === 0) return false;

  const col = await charactersCollection();
  const result = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...sanitized, updatedAt: new Date() } as Record<string, unknown> },
  );
  return result.modifiedCount > 0;
}

/* ── 삭제 ── */

export async function deleteCharacter(id: string): Promise<boolean> {
  const col = await charactersCollection();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

/* ── 인덱스 보장 ── */

export async function ensureCharacterIndexes(): Promise<void> {
  const col = await charactersCollection();
  await col.createIndex({ codename: 1 }, { unique: true });
  await col.createIndex({ type: 1, isPublic: 1 });
  await col.createIndex({ ownerId: 1 });
}
