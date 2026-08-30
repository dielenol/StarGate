import { createHash } from "node:crypto";

import {
  ObjectId,
  type ClientSession,
  type Db,
  type Filter,
} from "mongodb";

import {
  charactersCol,
  honorAnalysisStatesCol,
  honorRecordsCol,
  usersCol,
} from "../collections.js";
import { getClient, getDb } from "../client.js";
import { OPERATION_HONOR_CATEGORIES } from "../types/index.js";
import type {
  Character,
  HonorReviewState,
  HonorCharacterIdentity,
  HonorRecord,
  HonorRecordPage,
  HonorRecordQuery,
  NovexHonorFallbackPerformance,
  StockInvestmentSeason,
  StockSeasonPerformance,
  UpsertHonorRecordInput,
  User,
  UserStatus,
} from "../types/index.js";

const HONOR_RECORD_LIMIT_MAX = 100;
const MAX_ERROR_LENGTH = 1_000;
const HONOR_HASH_PATTERN = /^[a-f0-9]{64}$/u;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildHonorPublicKey(logicalKey: string): string {
  return `honor_${sha256(logicalKey).slice(0, 24)}`;
}

export function buildNovexHonorLogicalKey(
  seasonId: string,
  characterId: string,
): string {
  return `novex:${seasonId}:${characterId}`;
}

export function buildOperationHonorLogicalKey(
  sessionId: string,
  characterId: string,
): string {
  return `operation:${sessionId}:${characterId}`;
}

interface HonorCursor {
  occurredAt: string;
  publicKey: string;
}

function encodeCursor(record: HonorRecord): string {
  return Buffer.from(
    JSON.stringify({
      occurredAt: record.occurredAt.toISOString(),
      publicKey: record.publicKey,
    } satisfies HonorCursor),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string): HonorCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<HonorCursor>;
    const occurredAt = new Date(parsed.occurredAt ?? "");
    if (
      !Number.isFinite(occurredAt.getTime()) ||
      typeof parsed.publicKey !== "string" ||
      parsed.publicKey.length === 0
    ) {
      throw new Error("invalid");
    }
    return {
      occurredAt: occurredAt.toISOString(),
      publicKey: parsed.publicKey,
    };
  } catch {
    throw new Error("INVALID_HONOR_CURSOR");
  }
}

export async function listHonorRecords(
  input: HonorRecordQuery = {},
): Promise<HonorRecordPage> {
  const limit = Math.min(
    HONOR_RECORD_LIMIT_MAX,
    Math.max(1, Math.trunc(input.limit ?? 20)),
  );
  const filter: Filter<HonorRecord> = {
    status: input.status ?? "ACTIVE",
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.characterId ? { characterId: input.characterId } : {}),
    ...(input.sourceType ? { "source.type": input.sourceType } : {}),
    ...(input.sourceKey ? { "source.key": input.sourceKey } : {}),
    ...(input.minRole ? { minRole: input.minRole } : {}),
  };
  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    const occurredAt = new Date(cursor.occurredAt);
    filter.$or = [
      { occurredAt: { $lt: occurredAt } },
      { occurredAt, publicKey: { $lt: cursor.publicKey } },
    ];
  }
  const rows = await (await honorRecordsCol())
    .find(filter)
    .sort({ occurredAt: -1, publicKey: -1 })
    .limit(limit + 1)
    .toArray();
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    ...(hasMore && items.length > 0
      ? { nextCursor: encodeCursor(items[items.length - 1]!) }
      : {}),
  };
}

export async function countHonorRecords(
  input: Omit<HonorRecordQuery, "cursor" | "limit"> = {},
): Promise<number> {
  return (await honorRecordsCol()).countDocuments({
    status: input.status ?? "ACTIVE",
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.characterId ? { characterId: input.characterId } : {}),
    ...(input.sourceType ? { "source.type": input.sourceType } : {}),
    ...(input.sourceKey ? { "source.key": input.sourceKey } : {}),
    ...(input.minRole ? { minRole: input.minRole } : {}),
  });
}

export async function getHonorRecordByPublicKey(
  publicKey: string,
): Promise<HonorRecord | null> {
  return (await honorRecordsCol()).findOne({ publicKey, status: "ACTIVE" });
}

export async function listFinalizedNovexSeasons(
  limit = 20,
): Promise<StockInvestmentSeason[]> {
  return (await getDb())
    .collection<StockInvestmentSeason>("stock_investment_seasons")
    .find({ status: "FINALIZED" })
    .sort({ finalizedAt: -1, endsAt: -1, _id: -1 })
    .limit(Math.min(100, Math.max(1, Math.trunc(limit))))
    .toArray();
}

export async function countFinalizedNovexSeasons(): Promise<number> {
  return (await getDb())
    .collection<StockInvestmentSeason>("stock_investment_seasons")
    .countDocuments({ status: "FINALIZED" });
}

export async function countFinalizedNovexTop3Performances(): Promise<number> {
  const result = await (await getDb())
    .collection<StockSeasonPerformance>("stock_season_performance")
    .aggregate<{ count: number }>([
      {
        $match: {
          eligible: true,
          rank: { $in: [1, 2, 3] },
        },
      },
      {
        $lookup: {
          from: "stock_investment_seasons",
          localField: "seasonId",
          foreignField: "_id",
          as: "season",
        },
      },
      { $match: { "season.status": "FINALIZED" } },
      { $group: { _id: "$seasonId", podiumEntries: { $sum: 1 } } },
      {
        $group: {
          _id: null,
          count: {
            $sum: {
              $cond: [{ $gt: ["$podiumEntries", 3] }, 3, "$podiumEntries"],
            },
          },
        },
      },
    ])
    .next();
  return result?.count ?? 0;
}

export async function listNovexHonorRecords(
  seasonId: string,
): Promise<HonorRecord[]> {
  return (await honorRecordsCol())
    .find({
      domain: "NOVEX",
      "source.type": "STOCK_SEASON",
      "source.key": seasonId,
      status: "ACTIVE",
    })
    .sort({ rank: 1, codenameSnapshot: 1 })
    .limit(3)
    .toArray();
}

/** 원장 첫 materialization 전에도 같은 characterId 기반 publicKey를 만들기 위한 TOP3 SSOT 조회. */
export async function listNovexHonorFallbackPerformances(
  seasonId: string,
): Promise<NovexHonorFallbackPerformance[]> {
  return (await getDb())
    .collection<StockSeasonPerformance>("stock_season_performance")
    .find({
      seasonId,
      eligible: true,
      rank: { $in: [1, 2, 3] },
    })
    .project<NovexHonorFallbackPerformance>({
      _id: 0,
      characterId: 1,
      codename: 1,
      linkedReturn: 1,
      rank: 1,
      title: 1,
      badge: 1,
    })
    .sort({ rank: 1, codename: 1 })
    .limit(3)
    .toArray();
}

export interface HonorCandidateResolution {
  matchingCharacters: HonorCharacterIdentity[];
  ownerStates: Array<{ _id: ObjectId; status: UserStatus }>;
  eligibleCharacters: HonorCharacterIdentity[];
}

/**
 * 관련 코드네임의 전체 identity dependency와 최종 eligible 후보를 함께 해석한다.
 * completion은 NPC/ownerless/inactive-owner도 잠가 자격 전환 race를 막는다.
 */
export async function resolveHonorCandidateCharactersByCodenames(
  codenames: readonly string[],
  options: { session?: ClientSession; db?: Db } = {},
): Promise<HonorCandidateResolution> {
  const normalized = [...new Set(codenames.map((value) => value.trim()))]
    .filter(Boolean);
  if (normalized.length === 0) {
    return {
      matchingCharacters: [],
      ownerStates: [],
      eligibleCharacters: [],
    };
  }
  const characterCollection = options.db
    ? options.db.collection<Character>("characters")
    : await charactersCol();
  const characters = await characterCollection
    .find(
      { codename: { $in: normalized } },
      {
        projection: { _id: 1, type: 1, ownerId: 1, codename: 1 },
        session: options.session,
      },
    )
    .toArray();
  const codenameCounts = new Map<string, number>();
  for (const character of characters) {
    codenameCounts.set(
      character.codename,
      (codenameCounts.get(character.codename) ?? 0) + 1,
    );
  }
  const eligibleCharacters = characters.filter(
    (character) =>
      codenameCounts.get(character.codename) === 1 &&
      character.type === "AGENT" &&
      typeof character.ownerId === "string" &&
      ObjectId.isValid(character.ownerId),
  );
  const ownerObjectIds = eligibleCharacters
    .flatMap((character) =>
      character.ownerId && ObjectId.isValid(character.ownerId)
        ? [new ObjectId(character.ownerId)]
        : [],
    );
  const dependencyOwnerObjectIds = [
    ...new Set(
      characters.flatMap((character) =>
        character.ownerId && ObjectId.isValid(character.ownerId)
          ? [character.ownerId]
          : [],
      ),
    ),
  ].map((id) => new ObjectId(id));
  const ownerStates = dependencyOwnerObjectIds.length > 0
    ? await (options.db
        ? options.db.collection<User>("users")
        : await usersCol())
        .find(
          { _id: { $in: dependencyOwnerObjectIds } },
          { projection: { _id: 1, status: 1 }, session: options.session },
        )
        .toArray()
    : [];
  const eligibleOwnerIds = new Set(ownerObjectIds.map(String));
  const activeOwnerIds = new Set(
    ownerStates
      .filter(
        (owner) =>
          owner.status === "ACTIVE" && eligibleOwnerIds.has(String(owner._id)),
      )
      .map((owner) => String(owner._id)),
  );
  const matchingCharacters = characters.map((character) => ({
    _id: character._id,
    type: character.type,
    ownerId: character.ownerId,
    codename: character.codename,
  }));
  return {
    matchingCharacters,
    ownerStates: ownerStates.map((owner) => ({
      _id: owner._id,
      status: owner.status,
    })),
    eligibleCharacters: eligibleCharacters
      .filter(
        (character) =>
          Boolean(character.ownerId) && activeOwnerIds.has(character.ownerId!),
      )
      .map((character) => ({
        _id: character._id,
        type: character.type,
        ownerId: character.ownerId,
        codename: character.codename,
      })),
  };
}

/** sourceHash와 worker 분석이 공유하는 exact/비중복 ACTIVE owner AGENT 조회. */
export async function findHonorCandidateCharactersByCodenames(
  codenames: readonly string[],
  options: { session?: ClientSession; db?: Db } = {},
): Promise<HonorCharacterIdentity[]> {
  return (
    await resolveHonorCandidateCharactersByCodenames(codenames, options)
  ).eligibleCharacters.map((character) => ({
    _id: character._id,
    type: character.type,
    ownerId: character.ownerId,
    codename: character.codename,
  }));
}

export async function upsertHonorRecord(
  input: UpsertHonorRecordInput,
  options: { session?: ClientSession } = {},
): Promise<HonorRecord> {
  assertHonorRecordInvariants(input);
  const result = await (await honorRecordsCol()).findOneAndUpdate(
    { logicalKey: input.logicalKey },
    { $set: input },
    { upsert: true, returnDocument: "after", session: options.session },
  );
  if (!result) throw new Error("HONOR_RECORD_UPSERT_FAILED");
  return result;
}

export function assertHonorRecordInvariants(
  input: UpsertHonorRecordInput,
): void {
  if (
    (input.domain !== "NOVEX" && input.domain !== "OPERATION") ||
    input.publicKey !== buildHonorPublicKey(input.logicalKey) ||
    !input.logicalKey.trim() ||
    !input.characterId.trim() ||
    !input.codenameSnapshot.trim() ||
    !input.title.trim() ||
    input.title.length > 120 ||
    !input.citation.trim() ||
    input.citation.length > 1_000 ||
    !input.source.key.trim() ||
    !input.source.label.trim() ||
    !HONOR_HASH_PATTERN.test(input.sourceHash) ||
    input.status !== "ACTIVE" ||
    !Number.isFinite(input.occurredAt.getTime()) ||
    !Number.isFinite(input.issuedAt.getTime()) ||
    !Number.isFinite(input.updatedAt.getTime()) ||
    input.issuedAt.getTime() < input.occurredAt.getTime() ||
    input.updatedAt.getTime() < input.issuedAt.getTime()
  ) {
    throw new Error("HONOR_RECORD_INVARIANT_INVALID");
  }
  if (input.domain === "NOVEX") {
    if (
      input.category !== "NOVEX_PODIUM" ||
      input.source.type !== "STOCK_SEASON" ||
      !Number.isInteger(input.rank) ||
      !([1, 2, 3] as const).includes(input.rank as 1 | 2 | 3) ||
      input.minRole !== undefined ||
      input.analyzerRevision !== undefined ||
      input.evidenceAudit !== undefined ||
      input.logicalKey !==
        buildNovexHonorLogicalKey(input.source.key, input.characterId)
    ) {
      throw new Error("HONOR_RECORD_INVARIANT_INVALID");
    }
    return;
  }
  if (
    input.domain !== "OPERATION" ||
    input.category === "NOVEX_PODIUM" ||
    !OPERATION_HONOR_CATEGORIES.includes(input.category) ||
    input.source.type !== "SESSION_REPORT" ||
    input.rank !== undefined ||
    input.minRole !== "U" ||
    !input.analyzerRevision?.trim() ||
    !Array.isArray(input.evidenceAudit) ||
    input.evidenceAudit.length < 2 ||
    new Set(input.evidenceAudit.map((evidence) => evidence.hash)).size < 2 ||
    input.evidenceAudit.some(
      (evidence) =>
        !HONOR_HASH_PATTERN.test(evidence.hash) ||
        (evidence.section !== "SUMMARY" && evidence.section !== "HIGHLIGHT"),
    ) ||
    input.logicalKey !==
      buildOperationHonorLogicalKey(input.source.key, input.characterId)
  ) {
    throw new Error("HONOR_RECORD_INVARIANT_INVALID");
  }
}

export async function withdrawHonorRecordsBySource(input: {
  sourceType: "STOCK_SEASON" | "SESSION_REPORT";
  sourceKey: string;
  status?: "SUPERSEDED" | "WITHDRAWN";
  now?: Date;
  session?: ClientSession;
}): Promise<number> {
  const result = await (await honorRecordsCol()).updateMany(
    {
      "source.type": input.sourceType,
      "source.key": input.sourceKey,
      status: "ACTIVE",
    },
    {
      $set: {
        status: input.status ?? "WITHDRAWN",
        updatedAt: input.now ?? new Date(),
      },
    },
    { session: input.session },
  );
  return result.modifiedCount;
}

function formatKstDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\s/g, "");
}

export function buildNovexHonorRecords(input: {
  season: StockInvestmentSeason;
  performances: readonly StockSeasonPerformance[];
  issuedAt?: Date;
}): UpsertHonorRecordInput[] {
  const occurredAt = input.season.finalizedAt ?? input.season.endsAt;
  const issuedAt = input.issuedAt ?? occurredAt;
  const sourceLabel = `NOVEX ${formatKstDate(input.season.startsAt)}–${formatKstDate(input.season.endsAt)}`;
  const candidates = input.performances
    .filter(
      (row): row is StockSeasonPerformance & { rank: 1 | 2 | 3 } =>
        row.eligible &&
        row.rank !== undefined &&
        row.rank >= 1 &&
        row.rank <= 3,
    )
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.codename.localeCompare(right.codename, "ko") ||
        left.characterId.localeCompare(right.characterId),
    );
  const selected = ([1, 2, 3] as const).flatMap((rank) => {
    const row = candidates.find((candidate) => candidate.rank === rank);
    return row ? [row] : [];
  });
  return selected
    .map((row) => {
      const logicalKey = buildNovexHonorLogicalKey(
        input.season._id,
        row.characterId,
      );
      const sourceHash = sha256(
        stableJson({
          seasonId: input.season._id,
          characterId: row.characterId,
          rank: row.rank,
          linkedReturn: row.linkedReturn,
        }),
      );
      const returnPercent = new Intl.NumberFormat("ko-KR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        signDisplay: "always",
      }).format(row.linkedReturn * 100);
      return {
        publicKey: buildHonorPublicKey(logicalKey),
        logicalKey,
        domain: "NOVEX",
        category: "NOVEX_PODIUM",
        characterId: row.characterId,
        codenameSnapshot: row.codename,
        title:
          row.rank === 1
            ? "NOVEX 시즌 챔피언"
            : `NOVEX 시즌 ${row.rank}위`,
        citation: `${sourceLabel}에서 ${returnPercent}% 수익률로 ${row.rank}위를 기록했습니다.`,
        rank: row.rank,
        source: {
          type: "STOCK_SEASON",
          key: input.season._id,
          label: sourceLabel,
          href: `/erp/hall-of-fame?view=novex&season=${encodeURIComponent(input.season._id)}`,
        },
        sourceHash,
        status: "ACTIVE",
        occurredAt,
        issuedAt,
        updatedAt: issuedAt,
      };
    });
}

export async function materializeNovexSeasonHonors(input: {
  season: StockInvestmentSeason;
  performances: readonly StockSeasonPerformance[];
  session: ClientSession;
  issuedAt?: Date;
}): Promise<number> {
  const records = buildNovexHonorRecords(input);
  await withdrawHonorRecordsBySource({
    sourceType: "STOCK_SEASON",
    sourceKey: input.season._id,
    status: "SUPERSEDED",
    now: input.issuedAt ?? input.season.finalizedAt ?? input.season.endsAt,
    session: input.session,
  });
  for (const record of records) {
    await upsertHonorRecord(record, { session: input.session });
  }
  return records.length;
}

export interface QueueHonorReviewInput {
  sourceKey: string;
  sourceRecordId: string;
  sourceHash: string;
  analyzerRevision: string;
  now?: Date;
  session?: ClientSession;
  /** 접근등급이 다시 U로 내려오는 등 명시적 재활성화에만 사용한다. */
  force?: boolean;
}

/** revision 재심사는 기존 확정을 보존하고, 원문 hash 변경만 즉시 숨긴다. */
export function shouldSupersedeHonorsWhenQueueing(input: {
  existingSourceHash?: string;
  nextSourceHash: string;
  activeSourceHashes?: readonly string[];
}): boolean {
  if (input.existingSourceHash !== undefined) {
    return input.existingSourceHash !== input.nextSourceHash;
  }
  return (input.activeSourceHashes ?? []).some(
    (sourceHash) => sourceHash !== input.nextSourceHash,
  );
}

export function shouldForceHonorReviewAfterSourceRecovery(
  state?: Pick<HonorReviewState, "status" | "lastError"> | null,
): boolean {
  return Boolean(
    state?.status === "SKIPPED" &&
      /^SOURCE_(?:NOT_ELIGIBLE|NOT_ANALYZABLE|DELETED)$/u.test(
        state.lastError ?? "",
      ),
  );
}

/** source hash/revision이 바뀔 때 lore 검토를 대기시키고, 기존 원문의 공적은 즉시 숨긴다. */
export async function queueHonorReview(
  input: QueueHonorReviewInput,
): Promise<{ state: HonorReviewState; queued: boolean }> {
  if (
    !input.sourceKey.trim() ||
    !input.sourceRecordId.trim() ||
    !HONOR_HASH_PATTERN.test(input.sourceHash) ||
    !input.analyzerRevision.trim()
  ) {
    throw new Error("HONOR_REVIEW_QUEUE_INPUT_INVALID");
  }
  if (!input.session) {
    const client = await getClient();
    const session = client.startSession();
    let outcome: { state: HonorReviewState; queued: boolean } | undefined;
    try {
      await session.withTransaction(async () => {
        outcome = await queueHonorReview({ ...input, session });
      });
      if (!outcome) throw new Error("HONOR_REVIEW_QUEUE_FAILED");
      return outcome;
    } finally {
      await session.endSession();
    }
  }
  const now = input.now ?? new Date();
  const collection = await honorAnalysisStatesCol();
  const id = `session-report:${input.sourceKey}`;
  const existing = await collection.findOne(
    { _id: id },
    { session: input.session },
  );
  if (
    existing &&
    existing.sourceRecordId === input.sourceRecordId &&
    existing.sourceHash === input.sourceHash &&
    existing.analyzerRevision === input.analyzerRevision &&
    input.force !== true
  ) {
    return { state: existing, queued: false };
  }
  const activeSourceHashes = existing
    ? []
    : await (await honorRecordsCol()).distinct("sourceHash", {
        domain: "OPERATION",
        "source.type": "SESSION_REPORT",
        "source.key": input.sourceKey,
        status: "ACTIVE",
      }, { session: input.session });
  const shouldSupersede = shouldSupersedeHonorsWhenQueueing({
    existingSourceHash: existing?.sourceHash,
    nextSourceHash: input.sourceHash,
    activeSourceHashes,
  });

  const state = await collection.findOneAndUpdate(
    {
      _id: id,
      ...(existing
        ? {
            sourceHash: existing.sourceHash,
            analyzerRevision: existing.analyzerRevision,
          }
        : {}),
    },
    {
      $set: {
        sourceType: "SESSION_REPORT",
        sourceKey: input.sourceKey,
        sourceRecordId: input.sourceRecordId,
        sourceHash: input.sourceHash,
        analyzerRevision: input.analyzerRevision,
        status: "PENDING",
        attempts: 0,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
      $unset: {
        leaseToken: "",
        leaseUntil: "",
        nextAttemptAt: "",
        lastError: "",
        analyzedAt: "",
      },
    },
    {
      upsert: !existing,
      returnDocument: "after",
      session: input.session,
    },
  );
  if (!state) {
    const raced = await collection.findOne({ _id: id }, { session: input.session });
    if (!raced) throw new Error("HONOR_REVIEW_QUEUE_FAILED");
    return { state: raced, queued: false };
  }
  if (shouldSupersede) {
    await withdrawHonorRecordsBySource({
      sourceType: "SESSION_REPORT",
      sourceKey: input.sourceKey,
      status: "SUPERSEDED",
      now,
      session: input.session,
    });
  }
  return { state, queued: true };
}

export async function skipHonorReviewSource(input: {
  sourceKey: string;
  now?: Date;
  reason?: string;
  session?: ClientSession;
}): Promise<boolean> {
  if (!input.session) {
    const client = await getClient();
    const session = client.startSession();
    let skipped = false;
    try {
      await session.withTransaction(async () => {
        skipped = await skipHonorReviewSource({ ...input, session });
      });
      return skipped;
    } finally {
      await session.endSession();
    }
  }
  const now = input.now ?? new Date();
  const collection = await honorAnalysisStatesCol();
  const id = `session-report:${input.sourceKey}`;
  const reason = input.reason?.slice(0, MAX_ERROR_LENGTH);
  const existing = await collection.findOne(
    { _id: id },
    {
      projection: {
        status: 1,
        lastError: 1,
        leaseToken: 1,
        leaseUntil: 1,
        nextAttemptAt: 1,
      },
      session: input.session,
    },
  );
  const alreadyStable =
    existing?.status === "SKIPPED" &&
    existing.lastError === reason &&
    !existing.leaseToken &&
    !existing.leaseUntil &&
    !existing.nextAttemptAt;
  const result = alreadyStable
    ? null
    : await collection.updateOne(
        { _id: id },
        {
          $set: {
            status: "SKIPPED",
            updatedAt: now,
            ...(reason ? { lastError: reason } : {}),
          },
          $unset: {
            ...(!reason ? { lastError: "" } : {}),
            leaseToken: "",
            leaseUntil: "",
            nextAttemptAt: "",
          },
        },
        { session: input.session },
      );
  const withdrawn = await withdrawHonorRecordsBySource({
    sourceType: "SESSION_REPORT",
    sourceKey: input.sourceKey,
    status: "WITHDRAWN",
    now,
    session: input.session,
  });
  return (result?.modifiedCount ?? 0) === 1 || withdrawn > 0;
}
