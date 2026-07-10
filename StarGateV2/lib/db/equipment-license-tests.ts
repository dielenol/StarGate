import "server-only";

import { randomInt } from "node:crypto";

import { getDb } from "@stargate/shared-db";
import { ObjectId, type ClientSession, type Collection } from "mongodb";

import "./init";

import {
  TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
  TOWASKI_BASIC_LICENSE_TEST_RULES,
  TOWASKI_LICENSE_TARGET_LAYOUTS,
  type TowaskiLicenseTarget,
} from "@/lib/equipment-shop/license-test";

const COLLECTION_NAME = "equipment_license_tests";
const REDEMPTION_LEASE_MS = 20_000;

export type TowaskiLicenseChallengeStatus =
  | "active"
  | "passed"
  | "redeeming"
  | "failed"
  | "redeemed"
  | "expired"
  | "superseded";

export interface TowaskiLicenseChallenge {
  _id?: ObjectId;
  userId: string;
  characterId: string;
  characterCodename: string;
  licenseSlug: typeof TOWASKI_BASIC_FIREARM_LICENSE_SLUG;
  sequence: TowaskiLicenseTarget[];
  currentRound: number;
  hostileHits: number;
  civilianHits: number;
  shots: number;
  status: TowaskiLicenseChallengeStatus;
  startedAt: Date;
  roundStartedAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  redeemedAt?: Date;
  redemptionToken?: string;
  redemptionLeaseExpiresAt?: Date;
}

export type TowaskiLicenseChallengeErrorCode =
  | "INVALID_LICENSE_TEST"
  | "LICENSE_TEST_EXPIRED"
  | "LICENSE_TEST_STALE_ROUND"
  | "LICENSE_TEST_TOO_FAST"
  | "LICENSE_TEST_CONFLICT";

export class TowaskiLicenseChallengeError extends Error {
  constructor(
    readonly code: TowaskiLicenseChallengeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TowaskiLicenseChallengeError";
  }
}

let ensureIndexesPromise: Promise<void> | null = null;

async function challengeCollection(): Promise<
  Collection<TowaskiLicenseChallenge>
> {
  const db = await getDb();
  const collection = db.collection<TowaskiLicenseChallenge>(COLLECTION_NAME);
  ensureIndexesPromise ??= collection
    .createIndexes([
      {
        key: { expiresAt: 1 },
        name: "equipment_license_tests_expiresAt_ttl",
        expireAfterSeconds: 0,
      },
      {
        key: { userId: 1, characterId: 1, status: 1 },
        name: "equipment_license_tests_active_unique",
        unique: true,
        partialFilterExpression: { status: "active" },
      },
    ])
    .then(() => undefined)
    .catch((error) => {
      ensureIndexesPromise = null;
      throw error;
    });
  await ensureIndexesPromise;
  return collection;
}

function createTargetSequence(): TowaskiLicenseTarget[] {
  const kinds = [
    ...Array.from({ length: TOWASKI_BASIC_LICENSE_TEST_RULES.hostileTargets }, () =>
      "hostile" as const,
    ),
    ...Array.from({ length: TOWASKI_BASIC_LICENSE_TEST_RULES.civilianTargets }, () =>
      "civilian" as const,
    ),
  ];

  for (let index = kinds.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [kinds[index], kinds[swapIndex]] = [kinds[swapIndex], kinds[index]];
  }

  return TOWASKI_LICENSE_TARGET_LAYOUTS.map((layout, index) => ({
    ...layout,
    kind: kinds[index] ?? "hostile",
  }));
}

export async function createTowaskiLicenseChallenge(args: {
  userId: string;
  characterId: string;
  characterCodename: string;
}): Promise<TowaskiLicenseChallenge> {
  const collection = await challengeCollection();
  const now = new Date();
  await collection.updateMany(
    {
      userId: args.userId,
      characterId: args.characterId,
      status: "active",
    },
    { $set: { status: "superseded", completedAt: now } },
  );

  const challenge: TowaskiLicenseChallenge = {
    userId: args.userId,
    characterId: args.characterId,
    characterCodename: args.characterCodename,
    licenseSlug: TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    sequence: createTargetSequence(),
    currentRound: 0,
    hostileHits: 0,
    civilianHits: 0,
    shots: 0,
    status: "active",
    startedAt: now,
    roundStartedAt: now,
    expiresAt: new Date(
      now.getTime() + TOWASKI_BASIC_LICENSE_TEST_RULES.challengeTtlMs,
    ),
  };
  const result = await collection.insertOne(challenge);
  return { ...challenge, _id: result.insertedId };
}

export async function findTowaskiLicenseChallenge(args: {
  challengeId: string;
  userId: string;
  characterId: string;
}): Promise<TowaskiLicenseChallenge | null> {
  if (!ObjectId.isValid(args.challengeId)) return null;
  const collection = await challengeCollection();
  return collection.findOne({
    _id: new ObjectId(args.challengeId),
    userId: args.userId,
    characterId: args.characterId,
  });
}

export async function resolveTowaskiLicenseChallengeRound(args: {
  challengeId: string;
  userId: string;
  characterId: string;
  round: number;
  hit: boolean;
  shots: number;
}): Promise<TowaskiLicenseChallenge> {
  const collection = await challengeCollection();
  const challenge = await findTowaskiLicenseChallenge(args);
  if (!challenge?._id) {
    throw new TowaskiLicenseChallengeError(
      "INVALID_LICENSE_TEST",
      "유효한 사격 시험 세션을 찾을 수 없습니다.",
    );
  }
  if (challenge.status !== "active") return challenge;

  const now = new Date();
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    await collection.updateOne(
      { _id: challenge._id, status: "active" },
      { $set: { status: "expired", completedAt: now } },
    );
    throw new TowaskiLicenseChallengeError(
      "LICENSE_TEST_EXPIRED",
      "사격 시험 세션이 만료되었습니다. 다시 시작해 주세요.",
    );
  }
  if (challenge.currentRound >= challenge.sequence.length) return challenge;
  if (challenge.currentRound !== args.round) {
    throw new TowaskiLicenseChallengeError(
      "LICENSE_TEST_STALE_ROUND",
      "이미 처리됐거나 순서가 맞지 않는 표적입니다.",
    );
  }
  if (
    !Number.isInteger(args.shots) ||
    args.shots < 0 ||
    args.shots > TOWASKI_BASIC_LICENSE_TEST_RULES.maxShotsPerRound ||
    (args.hit && args.shots < 1)
  ) {
    throw new TowaskiLicenseChallengeError(
      "INVALID_LICENSE_TEST",
      "라운드 사격 기록이 올바르지 않습니다.",
    );
  }

  const target = challenge.sequence[challenge.currentRound];
  if (!target) return challenge;
  const elapsedMs = now.getTime() - challenge.roundStartedAt.getTime();
  const minElapsedMs = args.hit
    ? TOWASKI_BASIC_LICENSE_TEST_RULES.minHitReactionMs
    : TOWASKI_BASIC_LICENSE_TEST_RULES.minMissWindowMs;
  if (
    elapsedMs < minElapsedMs ||
    elapsedMs > TOWASKI_BASIC_LICENSE_TEST_RULES.maxRoundDurationMs
  ) {
    throw new TowaskiLicenseChallengeError(
      "LICENSE_TEST_TOO_FAST",
      "표적 반응 시간이 시험 범위를 벗어났습니다.",
    );
  }

  const updated = await collection.findOneAndUpdate(
    {
      _id: challenge._id,
      userId: args.userId,
      characterId: args.characterId,
      status: "active",
      currentRound: args.round,
    },
    {
      $inc: {
        currentRound: 1,
        hostileHits: target.kind === "hostile" && args.hit ? 1 : 0,
        civilianHits: target.kind === "civilian" && args.hit ? 1 : 0,
        shots: args.shots,
      },
      $set: { roundStartedAt: now },
    },
    { returnDocument: "after" },
  );
  if (!updated) {
    throw new TowaskiLicenseChallengeError(
      "LICENSE_TEST_CONFLICT",
      "동시에 같은 표적 기록이 처리되었습니다.",
    );
  }
  return updated;
}

export async function completeTowaskiLicenseChallenge(args: {
  challengeId: string;
  status: "passed" | "failed";
}): Promise<TowaskiLicenseChallenge | null> {
  if (!ObjectId.isValid(args.challengeId)) return null;
  const collection = await challengeCollection();
  const now = new Date();
  return collection.findOneAndUpdate(
    {
      _id: new ObjectId(args.challengeId),
      status: "active",
      currentRound: TOWASKI_LICENSE_TARGET_LAYOUTS.length,
    },
    { $set: { status: args.status, completedAt: now } },
    { returnDocument: "after" },
  );
}

export async function markTowaskiLicenseChallengeRedeemed(
  challengeId: string,
  redemptionToken: string,
  options: { session?: ClientSession } = {},
): Promise<boolean> {
  if (!ObjectId.isValid(challengeId)) return false;
  const collection = await challengeCollection();
  const now = new Date();
  const result = await collection.updateOne(
    {
      _id: new ObjectId(challengeId),
      status: "redeeming",
      redemptionToken,
    },
    {
      $set: { status: "redeemed", redeemedAt: now },
      $unset: { redemptionToken: "", redemptionLeaseExpiresAt: "" },
    },
    { session: options.session },
  );
  return result.modifiedCount === 1;
}

export async function claimTowaskiLicenseChallengeRedemption(
  challengeId: string,
  redemptionToken: string,
): Promise<boolean> {
  if (!ObjectId.isValid(challengeId)) return false;
  const collection = await challengeCollection();
  const now = new Date();
  const result = await collection.updateOne(
    {
      _id: new ObjectId(challengeId),
      $or: [
        { status: "passed" },
        {
          status: "redeeming",
          redemptionLeaseExpiresAt: { $lte: now },
        },
      ],
    },
    {
      $set: {
        status: "redeeming",
        redemptionToken,
        redemptionLeaseExpiresAt: new Date(now.getTime() + REDEMPTION_LEASE_MS),
        expiresAt: new Date(
          now.getTime() + TOWASKI_BASIC_LICENSE_TEST_RULES.challengeTtlMs,
        ),
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function releaseTowaskiLicenseChallengeRedemption(
  challengeId: string,
  redemptionToken: string,
): Promise<void> {
  if (!ObjectId.isValid(challengeId)) return;
  const collection = await challengeCollection();
  await collection.updateOne(
    {
      _id: new ObjectId(challengeId),
      status: "redeeming",
      redemptionToken,
    },
    {
      $set: { status: "passed" },
      $unset: { redemptionToken: "", redemptionLeaseExpiresAt: "" },
    },
  );
}

export async function findRecoverableTowaskiLicenseChallenge(args: {
  userId: string;
  characterId: string;
}): Promise<TowaskiLicenseChallenge | null> {
  const collection = await challengeCollection();
  return collection.findOne(
    {
      userId: args.userId,
      characterId: args.characterId,
      status: { $in: ["passed", "redeeming"] },
    },
    { sort: { startedAt: -1 } },
  );
}
