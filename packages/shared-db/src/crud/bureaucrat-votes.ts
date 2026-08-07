import { createHash, randomUUID } from "node:crypto";

import {
  MongoServerError,
  ObjectId,
  type Filter,
  type UpdateFilter,
} from "mongodb";

import { bureaucratVotesCol } from "../collections.js";
import {
  BUREAUCRAT_VOTE_CHANNEL_ID,
  BUREAUCRAT_VOTE_CONTENT_MAX_LENGTH,
  BUREAUCRAT_VOTE_DURATION_MS,
  BUREAUCRAT_VOTE_TITLE_MAX_LENGTH,
  type BureaucratVote,
  type BureaucratVoteActor,
  type BureaucratVoteChoice,
  type BureaucratVoteOutcome,
} from "../types/bureaucrat-vote.js";

const DEFAULT_PUBLICATION_LEASE_MS = 2 * 60 * 1_000;
const MAX_PUBLICATION_ERROR_LENGTH = 1_000;

export interface CreateBureaucratVoteInput {
  requestKey: string;
  source: "DISCORD_COMMAND" | "ERP_PRESET";
  presetKey?: string;
  guildId: string;
  title: string;
  content: string;
  createdBy: BureaucratVoteActor;
  createdAt?: Date;
}

export interface CreateBureaucratVoteResult {
  vote: BureaucratVote;
  created: boolean;
  conflict: "NONE" | "REQUEST_KEY" | "ACTIVE_PRESET";
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

function normalizedRequiredText(
  value: string,
  label: string,
  maxLength: number,
): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label}을(를) 비워둘 수 없습니다.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  }
  return normalized;
}

function voteObjectId(requestKey: string): ObjectId {
  const hex = createHash("sha256")
    .update(`registrar:bureaucrat-vote:v1:${requestKey}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return new ObjectId(hex);
}

function objectIdFilter(
  voteId: string,
  extra: Omit<Filter<BureaucratVote>, "_id"> = {},
): Filter<BureaucratVote> | null {
  if (!ObjectId.isValid(voteId)) return null;
  return {
    _id: new ObjectId(voteId),
    schemaVersion: 1,
    ...extra,
  } as Filter<BureaucratVote>;
}

export function countBureaucratVoteBallots(
  vote: Pick<BureaucratVote, "ballots">,
): { yes: number; no: number; total: number } {
  let yes = 0;
  let no = 0;
  for (const ballot of Object.values(vote.ballots)) {
    if (ballot.choice === "YES") yes += 1;
    if (ballot.choice === "NO") no += 1;
  }
  return { yes, no, total: yes + no };
}

/** 유효표의 과반만 가결한다. 동률과 무투표는 부결이다. */
export function decideBureaucratVoteMajority(
  vote: Pick<BureaucratVote, "ballots">,
): {
  outcome: BureaucratVoteOutcome;
  reason: string;
  tally: { yes: number; no: number; total: number };
} {
  const tally = countBureaucratVoteBallots(vote);
  const approved = tally.yes > tally.total / 2;
  return {
    outcome: approved ? "APPROVED" : "REJECTED",
    reason: approved
      ? `유효표 과반 찬성 (${tally.yes}/${tally.total})`
      : tally.total === 0
        ? "유효표 없음: 과반 미달"
        : `유효표 과반 미달 (${tally.yes}/${tally.total})`,
    tally,
  };
}

export async function createBureaucratVote(
  input: CreateBureaucratVoteInput,
): Promise<CreateBureaucratVoteResult> {
  const requestKey = normalizedRequiredText(input.requestKey, "요청 키", 240);
  const guildId = normalizedRequiredText(input.guildId, "길드 ID", 32);
  const title = normalizedRequiredText(
    input.title,
    "안건 제목",
    BUREAUCRAT_VOTE_TITLE_MAX_LENGTH,
  );
  const content = normalizedRequiredText(
    input.content,
    "안건 내용",
    BUREAUCRAT_VOTE_CONTENT_MAX_LENGTH,
  );
  const presetKey = input.presetKey?.trim() || undefined;
  if (input.source === "ERP_PRESET" && !presetKey) {
    throw new Error("ERP 고정 안건에는 presetKey가 필요합니다.");
  }
  if (input.source === "DISCORD_COMMAND" && presetKey) {
    throw new Error("Discord 직접 안건에는 presetKey를 지정할 수 없습니다.");
  }

  const col = await bureaucratVotesCol();
  const createdAt = input.createdAt ?? new Date();
  const doc: BureaucratVote = {
    _id: voteObjectId(requestKey),
    schemaVersion: 1,
    revision: 0,
    requestKey,
    source: input.source,
    ...(presetKey ? { presetKey, activePresetKey: presetKey } : {}),
    guildId,
    channelId: BUREAUCRAT_VOTE_CHANNEL_ID,
    title,
    content,
    status: "OPEN",
    ballots: {},
    publication: { state: "PENDING", attempts: 0 },
    closesAt: new Date(createdAt.getTime() + BUREAUCRAT_VOTE_DURATION_MS),
    createdBy: input.createdBy,
    createdAt,
    updatedAt: createdAt,
  };

  try {
    await col.insertOne(doc);
    return { vote: doc, created: true, conflict: "NONE" };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  const sameRequest = await col.findOne({ _id: doc._id, schemaVersion: 1 });
  if (sameRequest) {
    return {
      vote: sameRequest,
      created: false,
      conflict: "REQUEST_KEY",
    };
  }
  if (presetKey) {
    const activePreset = await col.findOne({
      schemaVersion: 1,
      status: "OPEN",
      activePresetKey: presetKey,
    });
    if (activePreset) {
      return {
        vote: activePreset,
        created: false,
        conflict: "ACTIVE_PRESET",
      };
    }
  }
  throw new Error("투표 중복 충돌 후 기존 원장을 확인하지 못했습니다.");
}

export async function findBureaucratVoteById(
  voteId: string,
): Promise<BureaucratVote | null> {
  const filter = objectIdFilter(voteId);
  if (!filter) return null;
  return (await bureaucratVotesCol()).findOne(filter);
}

export async function listBureaucratVotes(input: {
  limit?: number;
} = {}): Promise<BureaucratVote[]> {
  const limit = Number.isSafeInteger(input.limit) && (input.limit ?? 0) > 0
    ? Math.min(input.limit as number, 100)
    : 30;
  return (await bureaucratVotesCol())
    .find({ schemaVersion: 1 })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
}

export async function findOpenBureaucratVoteByPresetKey(
  presetKey: string,
): Promise<BureaucratVote | null> {
  return (await bureaucratVotesCol()).findOne({
    schemaVersion: 1,
    status: "OPEN",
    activePresetKey: presetKey,
  });
}

/** PENDING 또는 lease가 만료된 전달 건 하나를 원자적으로 점유한다. */
export async function claimNextBureaucratVotePublication(input: {
  now?: Date;
  leaseMs?: number;
} = {}): Promise<BureaucratVote | null> {
  const now = input.now ?? new Date();
  const leaseMs = Number.isSafeInteger(input.leaseMs) && (input.leaseMs ?? 0) > 0
    ? input.leaseMs as number
    : DEFAULT_PUBLICATION_LEASE_MS;
  const leaseToken = randomUUID();
  return (await bureaucratVotesCol()).findOneAndUpdate(
    {
      schemaVersion: 1,
      status: "OPEN",
      $or: [
        {
          "publication.state": "PENDING",
          closesAt: { $gt: now },
        },
        {
          "publication.state": "DISPATCHING",
          "publication.leaseUntil": { $lte: now },
        },
      ],
    },
    {
      $set: {
        "publication.state": "DISPATCHING",
        "publication.leaseToken": leaseToken,
        "publication.leaseUntil": new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
      $inc: { "publication.attempts": 1, revision: 1 },
      $unset: { "publication.lastError": "" },
    },
    { sort: { createdAt: 1, _id: 1 }, returnDocument: "after" },
  );
}

/** 슬래시 생성 직후 해당 원장만 즉시 게시하려는 경로용 점유 함수. */
export async function claimBureaucratVotePublicationById(input: {
  voteId: string;
  now?: Date;
  leaseMs?: number;
}): Promise<BureaucratVote | null> {
  const now = input.now ?? new Date();
  const leaseMs = Number.isSafeInteger(input.leaseMs) && (input.leaseMs ?? 0) > 0
    ? input.leaseMs as number
    : DEFAULT_PUBLICATION_LEASE_MS;
  const filter = objectIdFilter(input.voteId, {
    status: "OPEN",
    closesAt: { $gt: now },
    $or: [
      { "publication.state": "PENDING" },
      {
        "publication.state": "DISPATCHING",
        "publication.leaseUntil": { $lte: now },
      },
    ],
  });
  if (!filter) return null;
  const leaseToken = randomUUID();
  return (await bureaucratVotesCol()).findOneAndUpdate(
    filter,
    {
      $set: {
        "publication.state": "DISPATCHING",
        "publication.leaseToken": leaseToken,
        "publication.leaseUntil": new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
      $inc: { "publication.attempts": 1, revision: 1 },
      $unset: { "publication.lastError": "" },
    },
    { returnDocument: "after" },
  );
}

export async function markBureaucratVotePublicationSent(input: {
  voteId: string;
  leaseToken: string;
  messageId: string;
  sentAt?: Date;
}): Promise<BureaucratVote | null> {
  const sentAt = input.sentAt ?? new Date();
  const filter = objectIdFilter(input.voteId, {
    status: "OPEN",
    "publication.state": "DISPATCHING",
    "publication.leaseToken": input.leaseToken,
  });
  if (!filter) return null;
  return (await bureaucratVotesCol()).findOneAndUpdate(
    filter,
    {
      $set: {
        "publication.state": "SENT",
        "publication.messageId": input.messageId,
        "publication.sentAt": sentAt,
        updatedAt: sentAt,
      },
      $unset: {
        "publication.leaseToken": "",
        "publication.leaseUntil": "",
      },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" },
  );
}

export async function releaseBureaucratVotePublication(input: {
  voteId: string;
  leaseToken: string;
  error: unknown;
  releasedAt?: Date;
}): Promise<boolean> {
  const releasedAt = input.releasedAt ?? new Date();
  const filter = objectIdFilter(input.voteId, {
    status: "OPEN",
    "publication.state": "DISPATCHING",
    "publication.leaseToken": input.leaseToken,
  });
  if (!filter) return false;
  const message = input.error instanceof Error
    ? input.error.message
    : String(input.error);
  const result = await (await bureaucratVotesCol()).updateOne(
    filter,
    {
      $set: {
        "publication.state": "PENDING",
        "publication.lastError": message.slice(0, MAX_PUBLICATION_ERROR_LENGTH),
        updatedAt: releasedAt,
      },
      $unset: {
        "publication.leaseToken": "",
        "publication.leaseUntil": "",
      },
      $inc: { revision: 1 },
    },
  );
  return result.modifiedCount === 1;
}

export async function recordBureaucratVoteBallot(input: {
  voteId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  discordUserId: string;
  displayName: string;
  choice: BureaucratVoteChoice;
  submittedAt?: Date;
}): Promise<BureaucratVote | null> {
  const submittedAt = input.submittedAt ?? new Date();
  const filter = objectIdFilter(input.voteId, {
    guildId: input.guildId,
    channelId: input.channelId,
    status: "OPEN",
    closesAt: { $gt: submittedAt },
    "publication.state": "SENT",
    "publication.messageId": input.messageId,
  });
  if (!filter) return null;
  const ballotPath = `ballots.${input.discordUserId}`;
  return (await bureaucratVotesCol()).findOneAndUpdate(
    filter,
    {
      $set: {
        [ballotPath]: {
          choice: input.choice,
          displayName: input.displayName,
          submittedAt,
        },
        updatedAt: submittedAt,
      },
      $inc: { revision: 1 },
    } as UpdateFilter<BureaucratVote>,
    { returnDocument: "after" },
  );
}

export async function closeBureaucratVote(input: {
  voteId: string;
  expectedRevision: number;
  outcome: BureaucratVoteOutcome;
  reason: string;
  tally: { yes: number; no: number; total: number };
  trigger: "MANUAL" | "AUTO_EXPIRED";
  closedBy: BureaucratVoteActor;
  closedAt?: Date;
}): Promise<BureaucratVote | null> {
  const closedAt = input.closedAt ?? new Date();
  const filter = objectIdFilter(input.voteId, {
    status: "OPEN",
    revision: input.expectedRevision,
    "publication.state": { $ne: "DISPATCHING" },
    ...(input.trigger === "AUTO_EXPIRED"
      ? { closesAt: { $lte: closedAt } }
      : {}),
  });
  if (!filter) return null;
  return (await bureaucratVotesCol()).findOneAndUpdate(
    filter,
    {
      $set: {
        status: "CLOSED",
        resolution: {
          outcome: input.outcome,
          reason: input.reason,
          rule: "CAST_BALLOT_MAJORITY",
          trigger: input.trigger,
          tally: input.tally,
          closedBy: input.closedBy,
          closedAt,
        },
        updatedAt: closedAt,
      },
      $unset: {
        activePresetKey: "",
      },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" },
  );
}

export async function listDueBureaucratVotes(input: {
  now?: Date;
  limit?: number;
} = {}): Promise<BureaucratVote[]> {
  const now = input.now ?? new Date();
  const limit = Number.isSafeInteger(input.limit) && (input.limit ?? 0) > 0
    ? Math.min(input.limit as number, 100)
    : 25;
  return (await bureaucratVotesCol())
    .find({ schemaVersion: 1, status: "OPEN", closesAt: { $lte: now } })
    .sort({ closesAt: 1, _id: 1 })
    .limit(limit)
    .toArray();
}
