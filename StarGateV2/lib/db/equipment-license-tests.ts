import "server-only";

import { randomInt } from "node:crypto";

import { getClient, getDb } from "@stargate/shared-db";
import { ObjectId, type ClientSession, type Collection } from "mongodb";

import "./init";

import {
  evaluateTowaskiBasicLicenseTest,
  getTowaskiLicenseTestRules,
  TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
  TOWASKI_BASIC_LICENSE_TEST_RULES,
  TOWASKI_LICENSE_REDEMPTION_LEASE_MS,
  TOWASKI_LICENSE_TARGET_LAYOUTS,
  type TowaskiLicenseTestDifficulty,
  type TowaskiLicenseTarget,
} from "@/lib/equipment-shop/license-test";
import type { TowaskiLicenseSlug } from "@/lib/equipment-shop/licenses";

const COLLECTION_NAME = "equipment_license_tests";
const REQUEST_COLLECTION_NAME = "equipment_license_test_requests";

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
  licenseSlug: TowaskiLicenseSlug;
  difficulty?: TowaskiLicenseTestDifficulty;
  startRequestId?: string;
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

interface TowaskiLicenseChallengeOutcome {
  currentRound: number;
  hostileHits: number;
  civilianHits: number;
  shots: number;
  status: TowaskiLicenseChallengeStatus;
  roundStartedAt: Date;
  completedAt?: Date;
}

type TowaskiLicenseTestRequestRecord =
  | {
      _id?: ObjectId;
      userId: string;
      characterId: string;
      requestId: string;
      action: "start";
      licenseSlug?: TowaskiLicenseSlug;
      difficulty: TowaskiLicenseTestDifficulty;
      challengeId: ObjectId;
      outcome: TowaskiLicenseChallengeOutcome;
      createdAt: Date;
    }
  | {
      _id?: ObjectId;
      userId: string;
      characterId: string;
      requestId: string;
      action: "resolve";
      challengeId: ObjectId;
      round: number;
      hit: boolean;
      shots: number;
      outcome: TowaskiLicenseChallengeOutcome;
      createdAt: Date;
    };

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
let ensureRequestIndexesPromise: Promise<void> | null = null;

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
      {
        key: { userId: 1, characterId: 1, startRequestId: 1 },
        name: "equipment_license_tests_start_request_unique",
        unique: true,
        partialFilterExpression: { startRequestId: { $type: "string" } },
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

async function requestCollection(): Promise<
  Collection<TowaskiLicenseTestRequestRecord>
> {
  const db = await getDb();
  const collection = db.collection<TowaskiLicenseTestRequestRecord>(
    REQUEST_COLLECTION_NAME,
  );
  ensureRequestIndexesPromise ??= collection
    .createIndex(
      { userId: 1, characterId: 1, requestId: 1 },
      {
        name: "equipment_license_test_requests_unique",
        unique: true,
      },
    )
    .then(() => undefined)
    .catch((error) => {
      ensureRequestIndexesPromise = null;
      throw error;
    });
  await ensureRequestIndexesPromise;
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

function challengeOutcome(
  challenge: TowaskiLicenseChallenge,
): TowaskiLicenseChallengeOutcome {
  return {
    currentRound: challenge.currentRound,
    hostileHits: challenge.hostileHits,
    civilianHits: challenge.civilianHits,
    shots: challenge.shots,
    status: challenge.status,
    roundStartedAt: challenge.roundStartedAt,
    ...(challenge.completedAt ? { completedAt: challenge.completedAt } : {}),
  };
}

function applyChallengeOutcome(
  challenge: TowaskiLicenseChallenge,
  outcome: TowaskiLicenseChallengeOutcome,
): TowaskiLicenseChallenge {
  return {
    ...challenge,
    currentRound: outcome.currentRound,
    hostileHits: outcome.hostileHits,
    civilianHits: outcome.civilianHits,
    shots: outcome.shots,
    status: outcome.status,
    roundStartedAt: outcome.roundStartedAt,
    completedAt: outcome.completedAt,
  };
}

function createTowaskiLicenseChallengeDocument(args: {
  userId: string;
  characterId: string;
  characterCodename: string;
  licenseSlug: TowaskiLicenseSlug;
  difficulty: TowaskiLicenseTestDifficulty;
  requestId: string;
}): TowaskiLicenseChallenge {
  const now = new Date();
  return {
    userId: args.userId,
    characterId: args.characterId,
    characterCodename: args.characterCodename,
    licenseSlug: args.licenseSlug,
    difficulty: args.difficulty,
    startRequestId: args.requestId,
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
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

async function findStartRequestReplay(
  args: {
    userId: string;
    characterId: string;
    requestId: string;
    licenseSlug: TowaskiLicenseSlug;
    difficulty: TowaskiLicenseTestDifficulty;
  },
  session?: ClientSession,
): Promise<TowaskiLicenseChallenge | null> {
  const [challenges, requests] = await Promise.all([
    challengeCollection(),
    requestCollection(),
  ]);
  const request = await requests.findOne(
    {
      userId: args.userId,
      characterId: args.characterId,
      requestId: args.requestId,
    },
    { session },
  );
  if (request) {
    if (
      request.action !== "start" ||
      (request.licenseSlug ?? TOWASKI_BASIC_FIREARM_LICENSE_SLUG) !==
        args.licenseSlug ||
      request.difficulty !== args.difficulty
    ) {
      throw new TowaskiLicenseChallengeError(
        "LICENSE_TEST_CONFLICT",
        "동일한 요청 키를 다른 사격 시험 요청에 사용할 수 없습니다.",
      );
    }
    const challenge = await challenges.findOne(
      { _id: request.challengeId },
      { session },
    );
    if (!challenge) {
      throw new TowaskiLicenseChallengeError(
        "LICENSE_TEST_EXPIRED",
        "사격 시험 요청 기록이 만료되었습니다. 새 요청으로 다시 시작해 주세요.",
      );
    }
    return applyChallengeOutcome(challenge, request.outcome);
  }

  const legacy = await challenges.findOne(
    {
      userId: args.userId,
      characterId: args.characterId,
      startRequestId: args.requestId,
    },
    { session },
  );
  if (
    legacy &&
    (legacy.licenseSlug !== args.licenseSlug ||
      (legacy.difficulty ?? "standard") !== args.difficulty)
  ) {
    throw new TowaskiLicenseChallengeError(
      "LICENSE_TEST_CONFLICT",
      "동일한 요청 키를 다른 시험 난이도에 사용할 수 없습니다.",
    );
  }
  return legacy;
}

export async function startOrResumeTowaskiLicenseChallenge(args: {
  userId: string;
  characterId: string;
  characterCodename: string;
  licenseSlug: TowaskiLicenseSlug;
  difficulty: TowaskiLicenseTestDifficulty;
  requestId: string;
}): Promise<TowaskiLicenseChallenge> {
  const replay = await findStartRequestReplay(args);
  if (replay) return replay;

  const [challenges, requests, client] = await Promise.all([
    challengeCollection(),
    requestCollection(),
    getClient(),
  ]);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const session = client.startSession();
    try {
      const challenge = await session.withTransaction(async () => {
        const transactionReplay = await findStartRequestReplay(args, session);
        if (transactionReplay) return transactionReplay;

        const now = new Date();
        await challenges.updateMany(
          {
            userId: args.userId,
            characterId: args.characterId,
            status: "active",
            expiresAt: { $lte: now },
          },
          { $set: { status: "expired", completedAt: now } },
          { session },
        );
        let selected = await challenges.findOne(
          {
            userId: args.userId,
            characterId: args.characterId,
            status: "active",
            expiresAt: { $gt: now },
          },
          { session },
        );
        if (selected && selected.licenseSlug !== args.licenseSlug) {
          throw new TowaskiLicenseChallengeError(
            "LICENSE_TEST_CONFLICT",
            "다른 자격시험이 진행 중입니다. 해당 시험을 먼저 종료해 주세요.",
          );
        }
        selected ??= await challenges.findOne(
          {
            userId: args.userId,
            characterId: args.characterId,
            licenseSlug: args.licenseSlug,
            status: { $in: ["passed", "redeeming"] },
          },
          { session, sort: { startedAt: -1 } },
        );
        if (!selected) {
          const created = createTowaskiLicenseChallengeDocument(args);
          const result = await challenges.insertOne(created, { session });
          selected = { ...created, _id: result.insertedId };
        }
        if (!selected._id) throw new Error("사격 시험 challenge ID 발급 실패");
        if (
          selected.status === "active" &&
          selected.currentRound >= selected.sequence.length
        ) {
          const evaluation = evaluateTowaskiBasicLicenseTest(
            {
              hostileHits: selected.hostileHits,
              civilianHits: selected.civilianHits,
              shots: selected.shots,
              durationMs:
                selected.roundStartedAt.getTime() - selected.startedAt.getTime(),
            },
            selected.difficulty ?? "standard",
          );
          const completed = await challenges.findOneAndUpdate(
            { _id: selected._id, status: "active" },
            {
              $set: {
                status: evaluation.passed ? "passed" : "failed",
                completedAt: selected.roundStartedAt,
              },
            },
            { returnDocument: "after", session },
          );
          if (!completed) {
            throw new TowaskiLicenseChallengeError(
              "LICENSE_TEST_CONFLICT",
              "완료된 사격 시험 상태를 복구하지 못했습니다.",
            );
          }
          selected = completed;
        }

        await requests.insertOne(
          {
            userId: args.userId,
            characterId: args.characterId,
            requestId: args.requestId,
            action: "start",
            licenseSlug: args.licenseSlug,
            difficulty: args.difficulty,
            challengeId: selected._id,
            outcome: challengeOutcome(selected),
            createdAt: now,
          },
          { session },
        );
        return selected;
      });
      if (!challenge) throw new Error("사격 시험 세션 발급 결과가 없습니다.");
      return challenge;
    } catch (error) {
      const concurrentReplay = await findStartRequestReplay(args).catch(
        (replayError) => {
          if (replayError instanceof TowaskiLicenseChallengeError) {
            throw replayError;
          }
          return null;
        },
      );
      if (concurrentReplay) return concurrentReplay;
      if (!isDuplicateKeyError(error) || attempt === 1) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw new TowaskiLicenseChallengeError(
    "LICENSE_TEST_CONFLICT",
    "동시에 다른 사격 시험이 발급되었습니다. 다시 시도해 주세요.",
  );
}

export async function findTowaskiLicenseTestRequestChallenge(args: {
  userId: string;
  characterId: string;
  requestId: string;
}): Promise<{
  action: TowaskiLicenseTestRequestRecord["action"];
  challenge: TowaskiLicenseChallenge;
} | null> {
  const [requests, challenges] = await Promise.all([
    requestCollection(),
    challengeCollection(),
  ]);
  const request = await requests.findOne({
    userId: args.userId,
    characterId: args.characterId,
    requestId: args.requestId,
  });
  if (!request) return null;
  const challenge = await challenges.findOne({ _id: request.challengeId });
  if (!challenge) return null;
  return {
    action: request.action,
    challenge: applyChallengeOutcome(challenge, request.outcome),
  };
}

export async function resolveTowaskiLicenseChallengeRound(args: {
  challengeId: string;
  userId: string;
  characterId: string;
  round: number;
  hit: boolean;
  shots: number;
  requestId: string;
}): Promise<TowaskiLicenseChallenge> {
  const [challenges, requests, client] = await Promise.all([
    challengeCollection(),
    requestCollection(),
    getClient(),
  ]);
  const findReplay = async (session?: ClientSession) => {
    const request = await requests.findOne(
      {
        userId: args.userId,
        characterId: args.characterId,
        requestId: args.requestId,
      },
      { session },
    );
    if (!request) return null;
    if (
      request.action !== "resolve" ||
      request.challengeId.toString() !== args.challengeId ||
      request.round !== args.round ||
      request.hit !== args.hit ||
      request.shots !== args.shots
    ) {
      throw new TowaskiLicenseChallengeError(
        "LICENSE_TEST_CONFLICT",
        "동일한 요청 키를 다른 사격 기록에 사용할 수 없습니다.",
      );
    }
    const replay = await challenges.findOne(
      { _id: request.challengeId },
      { session },
    );
    if (!replay) {
      throw new TowaskiLicenseChallengeError(
        "LICENSE_TEST_EXPIRED",
        "사격 시험 요청 기록이 만료되었습니다. 새 요청으로 다시 시작해 주세요.",
      );
    }
    return applyChallengeOutcome(replay, request.outcome);
  };

  const replay = await findReplay();
  if (replay) return replay;
  if (!ObjectId.isValid(args.challengeId)) {
    throw new TowaskiLicenseChallengeError(
      "INVALID_LICENSE_TEST",
      "유효한 사격 시험 세션을 찾을 수 없습니다.",
    );
  }

  const session = client.startSession();
  try {
    const updated = await session.withTransaction(async () => {
      const transactionReplay = await findReplay(session);
      if (transactionReplay) return transactionReplay;

      const challenge = await challenges.findOne(
        {
          _id: new ObjectId(args.challengeId),
          userId: args.userId,
          characterId: args.characterId,
        },
        { session },
      );
      if (!challenge?._id) {
        throw new TowaskiLicenseChallengeError(
          "INVALID_LICENSE_TEST",
          "유효한 사격 시험 세션을 찾을 수 없습니다.",
        );
      }
      if (challenge.status !== "active") {
        throw new TowaskiLicenseChallengeError(
          "LICENSE_TEST_STALE_ROUND",
          "이미 종료된 사격 시험입니다.",
        );
      }

      const now = new Date();
      if (challenge.expiresAt.getTime() <= now.getTime()) {
        throw new TowaskiLicenseChallengeError(
          "LICENSE_TEST_EXPIRED",
          "사격 시험 세션이 만료되었습니다. 다시 시작해 주세요.",
        );
      }
      if (challenge.currentRound !== args.round) {
        throw new TowaskiLicenseChallengeError(
          "LICENSE_TEST_STALE_ROUND",
          "이미 처리됐거나 순서가 맞지 않는 표적입니다.",
        );
      }

      const rules = getTowaskiLicenseTestRules(
        challenge.difficulty ?? "standard",
      );
      if (
        !Number.isInteger(args.shots) ||
        args.shots < 0 ||
        args.shots > rules.maxShotsPerRound ||
        (args.hit && args.shots < 1)
      ) {
        throw new TowaskiLicenseChallengeError(
          "INVALID_LICENSE_TEST",
          "라운드 사격 기록이 올바르지 않습니다.",
        );
      }

      const target = challenge.sequence[challenge.currentRound];
      if (!target) {
        throw new TowaskiLicenseChallengeError(
          "LICENSE_TEST_STALE_ROUND",
          "처리할 사격 표적이 없습니다.",
        );
      }
      const elapsedMs = now.getTime() - challenge.roundStartedAt.getTime();
      const minElapsedMs = args.hit
        ? rules.minHitReactionMs
        : rules.minMissWindowMs;
      if (
        elapsedMs < minElapsedMs ||
        (args.hit && elapsedMs > rules.maxRoundDurationMs)
      ) {
        throw new TowaskiLicenseChallengeError(
          "LICENSE_TEST_TOO_FAST",
          "표적 반응 시간이 시험 범위를 벗어났습니다.",
        );
      }

      const nextRound = challenge.currentRound + 1;
      const nextHostileHits =
        challenge.hostileHits +
        (target.kind === "hostile" && args.hit ? 1 : 0);
      const nextCivilianHits =
        challenge.civilianHits +
        (target.kind === "civilian" && args.hit ? 1 : 0);
      const nextShots = challenge.shots + args.shots;
      const isFinalRound = nextRound === challenge.sequence.length;
      const finalEvaluation = isFinalRound
        ? evaluateTowaskiBasicLicenseTest(
            {
              hostileHits: nextHostileHits,
              civilianHits: nextCivilianHits,
              shots: nextShots,
              durationMs: now.getTime() - challenge.startedAt.getTime(),
            },
            challenge.difficulty ?? "standard",
          )
        : null;

      const next = await challenges.findOneAndUpdate(
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
          $set: {
            roundStartedAt: now,
            ...(finalEvaluation
              ? {
                  status: finalEvaluation.passed ? "passed" : "failed",
                  completedAt: now,
                }
              : {}),
          },
        },
        { returnDocument: "after", session },
      );
      if (!next) {
        throw new TowaskiLicenseChallengeError(
          "LICENSE_TEST_CONFLICT",
          "동시에 같은 표적 기록이 처리되었습니다.",
        );
      }
      await requests.insertOne(
        {
          userId: args.userId,
          characterId: args.characterId,
          requestId: args.requestId,
          action: "resolve",
          challengeId: challenge._id,
          round: args.round,
          hit: args.hit,
          shots: args.shots,
          outcome: challengeOutcome(next),
          createdAt: now,
        },
        { session },
      );
      return next;
    });
    if (!updated) throw new Error("사격 기록 처리 결과가 없습니다.");
    return updated;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const concurrentReplay = await findReplay();
      if (concurrentReplay) return concurrentReplay;
    }
    throw error;
  } finally {
    await session.endSession();
  }
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
        redemptionLeaseExpiresAt: new Date(
          now.getTime() + TOWASKI_LICENSE_REDEMPTION_LEASE_MS,
        ),
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
