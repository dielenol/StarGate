import {
  ObjectId,
  type Filter,
  type UpdateFilter,
} from "mongodb";
import { config } from "../config.js";
import {
  CENSOR3_VOTE_CHANNEL_ID,
  CENSOR3_VOTE_SUBJECT,
} from "../constants/registrar.js";
import type {
  CraftingVote,
  CraftingVoteChoice,
  CraftingVoteOutcome,
} from "../types/crafting-vote.js";
import { buildCraftingVoteLedgerId } from "../services/crafting-vote.js";
import { getClient } from "./client.js";

const COLLECTION = "registrar_crafting_votes";
const CENSOR_USE_VOTE_GUARD = {
  schemaVersion: 2,
  "subject.kind": "CENSOR_3_USE_APPROVAL",
  "subject.code": "ZULU_0028_CENSOR_3",
} as const;

function votes() {
  return getClient().db(config.mongoDbName).collection<CraftingVote>(COLLECTION);
}

function objectIdFilter(
  voteId: string,
  extra: Omit<Filter<CraftingVote>, "_id"> = {}
): Filter<CraftingVote> | null {
  if (!ObjectId.isValid(voteId)) return null;
  return {
    _id: new ObjectId(voteId),
    ...extra,
    ...CENSOR_USE_VOTE_GUARD,
  } as Filter<CraftingVote>;
}

export interface CreateCraftingVoteInput {
  guildId: string;
  requestRef: string;
  eligibleRoleId: string;
  closesAt: Date;
  createdByDiscordUserId: string;
  createdAt: Date;
}

export async function createCraftingVote(
  input: CreateCraftingVoteInput
): Promise<{ voteId: string; created: boolean }> {
  const voteId = buildCraftingVoteLedgerId(input.guildId, input.requestRef);
  const doc: CraftingVote = {
    _id: new ObjectId(voteId),
    schemaVersion: 2,
    revision: 0,
    guildId: input.guildId,
    channelId: CENSOR3_VOTE_CHANNEL_ID,
    messageId: "",
    requestRef: input.requestRef,
    eligibleRoleId: input.eligibleRoleId,
    subject: { ...CENSOR3_VOTE_SUBJECT },
    status: "OPEN",
    ballots: {},
    publication: {
      state: "PENDING",
      reconciliations: [],
    },
    closesAt: input.closesAt,
    createdByDiscordUserId: input.createdByDiscordUserId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  const result = await votes().updateOne(
    { _id: doc._id, ...CENSOR_USE_VOTE_GUARD } as Filter<CraftingVote>,
    { $setOnInsert: doc },
    { upsert: true }
  );
  return { voteId, created: result.upsertedCount === 1 };
}

export async function findCraftingVoteById(
  voteId: string,
  guildId?: string
): Promise<CraftingVote | null> {
  const filter = objectIdFilter(voteId, guildId ? { guildId } : {});
  if (!filter) return null;
  return votes().findOne(filter);
}

export async function markCraftingVotePublicationSent(
  voteId: string,
  operationKey: string,
  messageId: string,
  updatedAt: Date
): Promise<CraftingVote | null> {
  const filter = objectIdFilter(voteId, {
    status: "OPEN",
    "publication.state": "DISPATCHING",
    "publication.operationKey": operationKey,
  } as Filter<CraftingVote>);
  if (!filter) return null;
  return votes().findOneAndUpdate(
    filter,
    {
      $set: {
        messageId,
        "publication.state": "SENT",
        "publication.sentAt": updatedAt,
        updatedAt,
      },
      $unset: {
        "publication.operationKey": "",
        "publication.dispatchStartedAt": "",
      },
      $inc: { revision: 1 },
    } as UpdateFilter<CraftingVote>,
    { returnDocument: "after" }
  );
}

export async function claimCraftingVotePublication(input: {
  voteId: string;
  guildId: string;
  operationKey: string;
  claimedAt: Date;
}): Promise<CraftingVote | null> {
  const filter = objectIdFilter(input.voteId, {
    guildId: input.guildId,
    status: "OPEN",
    "publication.state": "PENDING",
  } as Filter<CraftingVote>);
  if (!filter) return null;
  return votes().findOneAndUpdate(
    filter,
    {
      $set: {
        "publication.state": "DISPATCHING",
        "publication.operationKey": input.operationKey,
        "publication.dispatchStartedAt": input.claimedAt,
        updatedAt: input.claimedAt,
      },
    } as UpdateFilter<CraftingVote>,
    { returnDocument: "after" }
  );
}

export async function releaseCraftingVotePublicationAfterConfirmedDelete(input: {
  voteId: string;
  operationKey: string;
  actorDiscordUserId: string;
  reason: string;
  at: Date;
}): Promise<boolean> {
  const filter = objectIdFilter(input.voteId, {
    status: "OPEN",
    "publication.state": "DISPATCHING",
    "publication.operationKey": input.operationKey,
  } as Filter<CraftingVote>);
  if (!filter) return false;
  const result = await votes().updateOne(
    filter,
    {
      $set: {
        messageId: "",
        "publication.state": "PENDING",
        updatedAt: input.at,
      },
      $unset: {
        "publication.operationKey": "",
        "publication.dispatchStartedAt": "",
      },
      $push: {
        "publication.reconciliations": {
          action: "CONFIRMED_DELETED_AFTER_FAILURE",
          actorDiscordUserId: input.actorDiscordUserId,
          reason: input.reason,
          at: input.at,
        },
      },
      $inc: { revision: 1 },
    } as UpdateFilter<CraftingVote>
  );
  return result.modifiedCount === 1;
}

export async function resetUncertainCraftingVotePublication(input: {
  voteId: string;
  guildId: string;
  actorDiscordUserId: string;
  reason: string;
  at: Date;
}): Promise<CraftingVote | null> {
  const filter = objectIdFilter(input.voteId, {
    guildId: input.guildId,
    status: "OPEN",
    "publication.state": { $in: ["DISPATCHING", "SENT"] },
  } as Filter<CraftingVote>);
  if (!filter) return null;
  return votes().findOneAndUpdate(
    filter,
    {
      $set: {
        messageId: "",
        "publication.state": "PENDING",
        updatedAt: input.at,
      },
      $unset: {
        "publication.operationKey": "",
        "publication.dispatchStartedAt": "",
      },
      $push: {
        "publication.reconciliations": {
          action: "CONFIRMED_NOT_SENT",
          actorDiscordUserId: input.actorDiscordUserId,
          reason: input.reason,
          at: input.at,
        },
      },
      $inc: { revision: 1 },
    } as UpdateFilter<CraftingVote>,
    { returnDocument: "after" }
  );
}

export async function linkUncertainCraftingVotePublication(input: {
  voteId: string;
  guildId: string;
  messageId: string;
  actorDiscordUserId: string;
  reason: string;
  at: Date;
}): Promise<CraftingVote | null> {
  const filter = objectIdFilter(input.voteId, {
    guildId: input.guildId,
    status: "OPEN",
    "publication.state": { $in: ["DISPATCHING", "SENT"] },
  } as Filter<CraftingVote>);
  if (!filter) return null;
  return votes().findOneAndUpdate(
    filter,
    {
      $set: {
        messageId: input.messageId,
        "publication.state": "SENT",
        "publication.sentAt": input.at,
        updatedAt: input.at,
      },
      $unset: {
        "publication.operationKey": "",
        "publication.dispatchStartedAt": "",
      },
      $push: {
        "publication.reconciliations": {
          action: "LINKED_EXISTING_MESSAGE",
          actorDiscordUserId: input.actorDiscordUserId,
          reason: input.reason,
          at: input.at,
        },
      },
      $inc: { revision: 1 },
    } as UpdateFilter<CraftingVote>,
    { returnDocument: "after" }
  );
}

/**
 * status와 closesAt 조건, 사용자별 ballot 경로 갱신을 한 문서 연산으로 묶습니다.
 * 결론 처리와 경합하면 먼저 원자적으로 반영된 연산만 성공합니다.
 */
export async function recordCraftingVoteBallot(input: {
  voteId: string;
  guildId: string;
  discordUserId: string;
  displayName: string;
  choice: CraftingVoteChoice;
  submittedAt: Date;
}): Promise<CraftingVote | null> {
  const filter = objectIdFilter(input.voteId, {
    guildId: input.guildId,
    status: "OPEN",
    closesAt: { $gt: input.submittedAt },
    "publication.state": "SENT",
  });
  if (!filter) return null;

  const ballotPath = `ballots.${input.discordUserId}`;
  const update = {
    $set: {
      [ballotPath]: {
        choice: input.choice,
        displayName: input.displayName,
        submittedAt: input.submittedAt,
      },
      updatedAt: input.submittedAt,
    },
    $inc: { revision: 1 },
  } as UpdateFilter<CraftingVote>;

  return votes().findOneAndUpdate(filter, update, {
    returnDocument: "after",
  });
}

/**
 * 마감 이후에만 유효표 과반 판정 결과를 한 번 기록합니다.
 */
export async function resolveCraftingVote(input: {
  voteId: string;
  guildId: string;
  expectedRevision: number;
  outcome: CraftingVoteOutcome;
  reason: string;
  tally: { yes: number; no: number; total: number };
  resolvedByDiscordUserId: string;
  resolvedAt: Date;
}): Promise<CraftingVote | null> {
  const filter = objectIdFilter(input.voteId, {
    guildId: input.guildId,
    status: "OPEN",
    revision: input.expectedRevision,
    closesAt: { $lte: input.resolvedAt },
    "publication.state": "SENT",
  });
  if (!filter) return null;

  return votes().findOneAndUpdate(
    filter,
    {
      $set: {
        status: "RESOLVED",
        resolution: {
          outcome: input.outcome,
          reason: input.reason,
          rule: "CAST_BALLOT_MAJORITY",
          tally: input.tally,
          resolvedByDiscordUserId: input.resolvedByDiscordUserId,
          resolvedAt: input.resolvedAt,
        },
        updatedAt: input.resolvedAt,
      },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" }
  );
}
