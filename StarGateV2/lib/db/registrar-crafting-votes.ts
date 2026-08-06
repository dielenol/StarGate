import "server-only";

import { getDb } from "@stargate/shared-db";
import { type ClientSession, type ObjectId } from "mongodb";

export const REGISTRAR_CRAFTING_VOTES_COLLECTION =
  "registrar_crafting_votes";
export const CENSOR_3_VOTE_CHANNEL_ID = "1534753076399833249";

interface RegistrarCensorUseVote {
  _id: ObjectId;
  schemaVersion: 2;
  channelId: string;
  requestRef: string;
  status: "OPEN" | "RESOLVED";
  subject: {
    kind: "CENSOR_3_USE_APPROVAL";
    code: "ZULU_0028_CENSOR_3";
    targetCharacterCodename: "네베드";
    usageQuantity: 1;
  };
  resolution?: {
    outcome: "APPROVED" | "REJECTED";
    rule: "CAST_BALLOT_MAJORITY";
    tally: {
      yes: number;
      no: number;
      total: number;
    };
    resolvedAt: Date;
  };
  execution?: {
    mode: "CONSUMABLE_USE";
    requestId: string;
    characterId: string;
    characterCodename: string;
    equipmentItemId: string;
    actionCode: string;
    consumableSlug: string;
    quantity: number;
    claimedAt: Date;
  };
  closesAt: Date;
}

export async function claimApprovedCensorUseVote(input: {
  requestId: string;
  characterId: string;
  characterCodename: string;
  equipmentItemId: string;
  actionCode: string;
  consumableSlug: string;
  quantity: number;
  claimedAt: Date;
  session: ClientSession;
}): Promise<{ voteId: string; requestRef: string } | null> {
  const collection = (await getDb()).collection<RegistrarCensorUseVote>(
    REGISTRAR_CRAFTING_VOTES_COLLECTION,
  );
  const vote = await collection.findOneAndUpdate(
    {
      schemaVersion: 2,
      channelId: CENSOR_3_VOTE_CHANNEL_ID,
      status: "RESOLVED",
      closesAt: { $lte: input.claimedAt },
      "subject.kind": "CENSOR_3_USE_APPROVAL",
      "subject.code": "ZULU_0028_CENSOR_3",
      "subject.targetCharacterCodename": "네베드",
      "subject.usageQuantity": 1,
      "resolution.outcome": "APPROVED",
      "resolution.rule": "CAST_BALLOT_MAJORITY",
      "resolution.tally.total": { $gte: 1 },
      $expr: {
        $gt: [
          "$resolution.tally.yes",
          { $divide: ["$resolution.tally.total", 2] },
        ],
      },
      execution: { $exists: false },
    },
    {
      $set: {
        execution: {
          mode: "CONSUMABLE_USE",
          requestId: input.requestId,
          characterId: input.characterId,
          characterCodename: input.characterCodename,
          equipmentItemId: input.equipmentItemId,
          actionCode: input.actionCode,
          consumableSlug: input.consumableSlug,
          quantity: input.quantity,
          claimedAt: input.claimedAt,
        },
      },
    },
    {
      sort: { "resolution.resolvedAt": 1, _id: 1 },
      returnDocument: "after",
      session: input.session,
    },
  );
  return vote?._id
    ? { voteId: vote._id.toHexString(), requestRef: vote.requestRef }
    : null;
}
