import { ObjectId } from "mongodb";

import "./init";

import type { AgentCharacter, RoleLevel } from "@stargate/shared-db";
import {
  characterChangeLogsCol,
  findCharacterById,
  insertChangeLog,
  updateCharacter,
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

export interface AdjustCharacterPointsResult {
  character: AgentCharacter;
  before: number;
  after: number;
}

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

  const updated = await updateCharacter(
    input.characterId,
    { play: { points: after } },
    { allowedFields: new Set(["play.points"]) },
  );
  if (!updated) {
    throw new Error("POINT_UPDATE_FAILED");
  }

  await insertChangeLog({
    characterId: new ObjectId(input.characterId),
    actorId: input.actorId,
    actorRole: input.actorRole,
    actorIsOwner: character.ownerId === input.actorId,
    source: "admin",
    changes: [{ field: "play.points", before, after }],
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });

  return { character, before, after };
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
