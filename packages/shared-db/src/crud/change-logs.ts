/**
 * character_change_logs CRUD
 *
 * 캐릭터 문서 수정 이력을 남기는 감사 로그. MongoDB 트랜잭션 미사용이라
 * 호출자는 characters.updateCharacter 성공 후 별도로 insertChangeLog 를 호출한다.
 *
 * 관리자 되돌림(revert)은 markChangeLogReverted 를 사용하며, 이미 revert 된 로그는
 * 멱등성을 위해 다시 마킹하지 않고 null 을 반환한다.
 */

import { type Collection, ObjectId } from "mongodb";

import { getDb, getDbSync } from "../client.js";

import type {
  CharacterChangeLog,
  NewCharacterChangeLog,
} from "../types/change-log.js";

/* ── 컬렉션 이름 / 접근자 ── */

const CHANGE_LOGS_COLLECTION = "character_change_logs";

export async function characterChangeLogsCol(): Promise<
  Collection<CharacterChangeLog>
> {
  const db = await getDb();
  return db.collection<CharacterChangeLog>(CHANGE_LOGS_COLLECTION);
}

export function characterChangeLogsColSync(): Collection<CharacterChangeLog> {
  return getDbSync().collection<CharacterChangeLog>(CHANGE_LOGS_COLLECTION);
}

/* ── 내부 유틸 ── */

function toObjectId(id: ObjectId | string): ObjectId | null {
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

/* ── 생성 ── */

export async function insertChangeLog(
  input: NewCharacterChangeLog
): Promise<CharacterChangeLog> {
  const col = await characterChangeLogsCol();
  const now = new Date();

  const doc = {
    ...input,
    createdAt: now,
    revertedAt: null,
    revertedBy: null,
  };

  const result = await col.insertOne(doc as CharacterChangeLog);
  return { ...doc, _id: result.insertedId } as CharacterChangeLog;
}

/* ── 조회 ── */

export async function getChangeLogById(
  logId: ObjectId | string
): Promise<CharacterChangeLog | null> {
  const oid = toObjectId(logId);
  if (!oid) return null;
  const col = await characterChangeLogsCol();
  return col.findOne({ _id: oid });
}

export async function listChangeLogsByCharacter(
  characterId: ObjectId | string,
  opts?: { limit?: number; skip?: number }
): Promise<CharacterChangeLog[]> {
  const oid = toObjectId(characterId);
  if (!oid) return [];

  const col = await characterChangeLogsCol();
  return col
    .find({ characterId: oid })
    .sort({ createdAt: -1 })
    .skip(opts?.skip ?? 0)
    .limit(opts?.limit ?? 20)
    .toArray();
}

export async function listChangeLogsByActor(
  actorId: string,
  opts?: { limit?: number; skip?: number }
): Promise<CharacterChangeLog[]> {
  const col = await characterChangeLogsCol();
  return col
    .find({ actorId })
    .sort({ createdAt: -1 })
    .skip(opts?.skip ?? 0)
    .limit(opts?.limit ?? 20)
    .toArray();
}

/**
 * 특정 actor 가 최근 windowMs 기간 동안 남긴 변경 로그 수.
 * 쿨다운 판정은 "시도 횟수" 기준이므로 revert 된 로그도 집계에 포함한다.
 */
export async function countRecentChangesByActor(
  actorId: string,
  windowMs: number
): Promise<number> {
  const col = await characterChangeLogsCol();
  const since = new Date(Date.now() - windowMs);
  return col.countDocuments({
    actorId,
    createdAt: { $gt: since },
  });
}

/* ── 수정 (revert 마킹) ── */

/**
 * 로그를 revert 상태로 마킹한다. 이미 revertedAt 이 설정돼 있으면
 * 중복 마킹하지 않고 null 을 반환 (멱등).
 */
export async function markChangeLogReverted(
  logId: ObjectId | string,
  revertedBy: string
): Promise<CharacterChangeLog | null> {
  const oid = toObjectId(logId);
  if (!oid) return null;

  const col = await characterChangeLogsCol();
  return col.findOneAndUpdate(
    { _id: oid, revertedAt: null },
    { $set: { revertedAt: new Date(), revertedBy } },
    { returnDocument: "after" }
  );
}
