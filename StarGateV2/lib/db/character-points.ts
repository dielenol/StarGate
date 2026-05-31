import { ObjectId, type Filter } from "mongodb";

import "./init";

import type {
  AgentCharacter,
  Character,
  RoleLevel,
} from "@stargate/shared-db";
import type { SessionRewardStatField } from "@/types/credit-admin";
import {
  characterChangeLogsCol,
  charactersCol,
  findCharacterById,
  insertChangeLog,
} from "@stargate/shared-db";

type PointMetadata = Record<string, string | number | boolean | null>;

interface AdjustCharacterPointsInput {
  characterId: string;
  amount: number;
  actorId: string;
  actorRole: RoleLevel;
  reason?: string;
  allowNegative?: boolean;
  metadata?: PointMetadata;
}

interface AdjustCharacterStatInput {
  characterId: string;
  field: SessionRewardStatField;
  amount: number;
  actorId: string;
  actorRole: RoleLevel;
  reason?: string;
  metadata?: PointMetadata;
}

export interface AdjustCharacterPointsResult {
  character: AgentCharacter;
  before: number;
  after: number;
  changeLogId: string;
}

export interface AdjustCharacterStatResult {
  character: AgentCharacter;
  field: SessionRewardStatField;
  before: number;
  after: number;
  changeLogId: string;
}

const STAT_FIELD_TO_PLAY_PATH: Record<SessionRewardStatField, string> = {
  hp: "play.hp",
  san: "play.san",
  def: "play.def",
  atk: "play.atk",
};

export async function adjustCharacterPoints(
  input: AdjustCharacterPointsInput,
): Promise<AdjustCharacterPointsResult> {
  if (!ObjectId.isValid(input.characterId)) {
    throw new Error("INVALID_CHARACTER_ID");
  }
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    throw new Error("INVALID_POINT_AMOUNT");
  }

  const character = await findCharacterById(input.characterId);
  if (!character || character.type !== "AGENT") {
    throw new Error("CHARACTER_NOT_FOUND");
  }

  const before = character.play.points ?? 0;
  const after = before + input.amount;
  if (!Number.isFinite(after)) {
    throw new Error("INVALID_POINT_BALANCE");
  }
  if (after < 0 && !input.allowNegative) {
    throw new Error("INSUFFICIENT_POINTS");
  }

  const changeLogInput: Parameters<typeof insertChangeLog>[0] = {
    characterId: new ObjectId(input.characterId),
    actorId: input.actorId,
    actorRole: input.actorRole,
    actorIsOwner: character.ownerId === input.actorId,
    source: "admin",
    changes: [{ field: "play.points", before, after }],
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  const isSessionPointReward =
    input.metadata?.rewardKind === "POINT" &&
    input.metadata?.autoReward === true &&
    typeof input.metadata.sessionId === "string";

  // 세션 포인트 보상은 change_logs 의 unique index가 멱등 backstop이다.
  // 먼저 로그를 예약해 두 GM 동시 발급 시 두 번째 요청이 포인트를 올리기 전에 실패하게 한다.
  const reservedLog = isSessionPointReward
    ? await insertChangeLog(changeLogInput)
    : null;

  const col = await charactersCol();
  const filter: Filter<Character> = {
    _id: new ObjectId(input.characterId),
    type: "AGENT",
  };
  if (input.amount < 0 && !input.allowNegative) {
    filter.$expr = {
      $gte: [{ $ifNull: ["$play.points", 0] }, Math.abs(input.amount)],
    };
  }

  const updated = (await col.findOneAndUpdate(
    filter,
    {
      $inc: { "play.points": input.amount },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  )) as AgentCharacter | null;

  if (!updated) {
    if (reservedLog?._id) {
      const logsCol = await characterChangeLogsCol();
      await logsCol.deleteOne({ _id: reservedLog._id });
    }
    const current = await findCharacterById(input.characterId);
    if (current && input.amount < 0 && !input.allowNegative) {
      throw new Error("INSUFFICIENT_POINTS");
    }
    throw new Error("POINT_UPDATE_FAILED");
  }

  const actualAfter = updated.play.points ?? 0;
  const actualBefore = actualAfter - input.amount;
  const actualChanges = [
    { field: "play.points", before: actualBefore, after: actualAfter },
  ];

  if (reservedLog?._id) {
    const logsCol = await characterChangeLogsCol();
    await logsCol.updateOne(
      { _id: reservedLog._id },
      { $set: { changes: actualChanges } },
    );
  }

  const changeLog =
    reservedLog ??
    (await insertChangeLog({
      ...changeLogInput,
      changes: actualChanges,
    }));

  return {
    character: updated,
    before: actualBefore,
    after: actualAfter,
    changeLogId: String(changeLog._id),
  };
}

export async function adjustCharacterStat(
  input: AdjustCharacterStatInput,
): Promise<AdjustCharacterStatResult> {
  if (!ObjectId.isValid(input.characterId)) {
    throw new Error("INVALID_CHARACTER_ID");
  }
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new Error("INVALID_STAT_AMOUNT");
  }

  const path = STAT_FIELD_TO_PLAY_PATH[input.field];
  const character = await findCharacterById(input.characterId);
  if (!character || character.type !== "AGENT") {
    throw new Error("CHARACTER_NOT_FOUND");
  }

  const before = character.play[input.field] ?? 0;
  const after = before + input.amount;
  if (!Number.isFinite(after)) {
    throw new Error("INVALID_STAT_BALANCE");
  }

  const changeLogInput: Parameters<typeof insertChangeLog>[0] = {
    characterId: new ObjectId(input.characterId),
    actorId: input.actorId,
    actorRole: input.actorRole,
    actorIsOwner: character.ownerId === input.actorId,
    source: "admin",
    changes: [{ field: path, before, after }],
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  const isSessionStatReward =
    input.metadata?.rewardKind === "STAT" &&
    input.metadata?.autoReward === true &&
    typeof input.metadata.sessionId === "string" &&
    typeof input.metadata.statField === "string";

  const reservedLog = isSessionStatReward
    ? await insertChangeLog(changeLogInput)
    : null;

  const col = await charactersCol();
  const updated = (await col.findOneAndUpdate(
    { _id: new ObjectId(input.characterId), type: "AGENT" },
    {
      $inc: { [path]: input.amount },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  )) as AgentCharacter | null;

  if (!updated) {
    if (reservedLog?._id) {
      const logsCol = await characterChangeLogsCol();
      await logsCol.deleteOne({ _id: reservedLog._id });
    }
    throw new Error("STAT_UPDATE_FAILED");
  }

  const actualAfter = updated.play[input.field] ?? 0;
  const actualBefore = actualAfter - input.amount;
  const actualChanges = [{ field: path, before: actualBefore, after: actualAfter }];

  if (reservedLog?._id) {
    const logsCol = await characterChangeLogsCol();
    await logsCol.updateOne(
      { _id: reservedLog._id },
      { $set: { changes: actualChanges } },
    );
  }

  const changeLog =
    reservedLog ??
    (await insertChangeLog({
      ...changeLogInput,
      changes: actualChanges,
    }));

  return {
    character: updated,
    field: input.field,
    before: actualBefore,
    after: actualAfter,
    changeLogId: String(changeLog._id),
  };
}

export async function listPointRewardedCharacterIdsBySession(
  sessionId: string,
): Promise<Set<string>> {
  const col = await characterChangeLogsCol();
  const rows = await col
    .find({
      "metadata.rewardKind": "POINT",
      "metadata.autoReward": true,
      "metadata.sessionId": sessionId,
      revertedAt: null,
    })
    .project<{ characterId: ObjectId }>({ characterId: 1 })
    .toArray();

  return new Set(rows.map((row) => row.characterId.toString()));
}

export async function listChangeLogRewardedCharacterIdsBySession(
  sessionId: string,
): Promise<Set<string>> {
  const col = await characterChangeLogsCol();
  const rows = await col
    .find({
      "metadata.autoReward": true,
      "metadata.sessionId": sessionId,
      revertedAt: null,
    })
    .project<{ characterId: ObjectId }>({ characterId: 1 })
    .toArray();

  return new Set(rows.map((row) => row.characterId.toString()));
}
