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

/**
 * 여러 소유자(users._id)의 캐릭터를 한 번에 조회한다.
 *
 * `ownerId` 는 `users._id` 의 string 표현.
 * UI에서 참여자 표시용으로 codename / sheet.name / agentLevel 만 필요하므로 projection 적용.
 * 빈 배열 입력은 즉시 short-circuit.
 */
export async function listCharactersByOwnerIds(
  ownerIds: string[]
): Promise<
  Pick<Character, "_id" | "codename" | "sheet" | "agentLevel" | "ownerId">[]
> {
  if (ownerIds.length === 0) return [];
  const col = await charactersCol();
  return col
    .find({ ownerId: { $in: ownerIds } })
    .project<
      Pick<Character, "_id" | "codename" | "sheet" | "agentLevel" | "ownerId">
    >({ codename: 1, sheet: 1, agentLevel: 1, ownerId: 1 })
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

/**
 * 관리자(ADMIN/GM) 경로에서 허용되는 최상위 필드 화이트리스트.
 *
 * `sheet` 루트 키가 포함되어 있어 호출자는 `sheet` 전체를 덮어쓰는 방식으로 업데이트한다.
 * 플레이어 자가편집처럼 sheet 하위 일부만 교체해야 하는 경우에는
 * `PLAYER_ALLOWED_CHARACTER_FIELDS` 같은 dot path 기반 화이트리스트를 사용한다.
 */
export const ALLOWED_CHARACTER_FIELDS = new Set<string>([
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

/**
 * 관리자 경로 별칭. 미래에 분기 로직이 생겼을 때 읽기 쉬우라고 도입한 표식.
 * 기존 `ALLOWED_CHARACTER_FIELDS` 이름도 계속 export 유지 — 기존 호출처 무수정.
 */
export const ADMIN_ALLOWED_CHARACTER_FIELDS = ALLOWED_CHARACTER_FIELDS;

/**
 * 플레이어 자가편집 화이트리스트. 이미지/능력치/소유권은 의도적으로 제외하고
 * 캐릭터 서술 필드만 dot path 로 지정한다.
 *
 * dot path가 포함된 필드는 `updateCharacter` 내부에서 `$set: { 'sheet.quote': ... }`
 * 형태로 부분 업데이트되며, `sheet` 루트 키 자체는 `$set`에 포함되지 않는다
 * (루트 키가 포함되면 sheet 전체가 덮어써져 능력치까지 날아감).
 */
export const PLAYER_ALLOWED_CHARACTER_FIELDS = new Set<string>([
  "sheet.quote",
  "sheet.appearance",
  "sheet.personality",
  "sheet.background",
  "sheet.gender",
  "sheet.age",
  "sheet.height",
]);

/** 객체에서 dot path 값을 읽어온다. 중간 경로가 undefined면 undefined 반환. */
function getPathValue(
  source: unknown,
  path: string
): unknown {
  if (source === null || source === undefined) return undefined;
  const segments = path.split(".");
  let cursor: unknown = source;
  for (const seg of segments) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

/**
 * 입력 객체와 허용 필드 셋(dot path 가능)을 받아 `$set` 오퍼레이터에 쓸 수 있는
 * flat key-value 레코드를 만든다. 허용 외 필드는 silent drop.
 *
 * - 단순 키 (`codename`): `input[key]` 를 그대로 매핑
 * - dot path (`sheet.quote`): `input.sheet?.quote` 를 읽어 `'sheet.quote'` 키로 매핑
 * - undefined 값은 $set에서 제외
 *
 * 루트 키(`sheet`)는 dot path 가 포함된 화이트리스트에서 **자동으로 빠진다** —
 * sheet 루트 키가 allowedFields 에 없으면 $set에도 포함되지 않기 때문.
 */
function buildUpdatePatch(
  input: Record<string, unknown>,
  allowedFields: Set<string>
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field.includes(".")) {
      const [root, ...rest] = field.split(".");
      const subPath = rest.join(".");
      const rootValue = input[root];
      const value = getPathValue(rootValue, subPath);
      if (value !== undefined) updates[field] = value;
    } else {
      const value = input[field];
      if (value !== undefined) updates[field] = value;
    }
  }
  return updates;
}

export async function updateCharacter(
  id: string,
  update: Record<string, unknown>,
  options?: { allowedFields?: Set<string> }
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const allowedFields = options?.allowedFields ?? ADMIN_ALLOWED_CHARACTER_FIELDS;
  const sanitized = buildUpdatePatch(update, allowedFields);
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
