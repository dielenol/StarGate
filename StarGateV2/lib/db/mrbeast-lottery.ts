import {
  ObjectId,
  type ClientSession,
  type Collection,
  type IndexDescriptionInfo,
} from "mongodb";

import type {
  MrBeastLotteryConfig,
  MrBeastLotteryTier,
} from "@/lib/shop/mrbeast-lottery";

import {
  addCredit,
  addToInventory,
  characterInventoryCol,
  getDb,
  lockCharacterInventoryItems,
  removeFromInventory,
} from "@stargate/shared-db";

import {
  getMrBeastLotteryPrize,
  isMrBeastLotteryActive,
  isMrBeastLotteryAnnouncementCandidate,
  isSafeMrBeastLotteryEventId,
  MRBEAST_LOTTERY_PRIZE_TABLE_VERSION,
  MRBEAST_LOTTERY_SLUG,
} from "@/lib/shop/mrbeast-lottery";
import { findMasterItemBySlug } from "@/lib/db/inventory";
import { SYSTEM_USER_ID_SENTINEL } from "@/lib/db/system-actor";
import { enqueueMrBeastLotteryWinnerWebhook } from "@/lib/outbox/integration";

const LOTTERY_CLAIMS_COLLECTION = "mrbeast_lottery_claims";
const LOTTERY_ENTITLEMENTS_COLLECTION = "mrbeast_lottery_entitlements";
const LOTTERY_CONFIG_COLLECTION = "shop_runtime_state";
const LOTTERY_CONFIG_ID = "mrbeast-lottery";
const CHARACTERS_COLLECTION = "characters";
const NOTIFICATIONS_COLLECTION = "notifications";
const LOTTERY_EVENT_ACTOR_NAME = "MRBEAST_LOTTERY_EVENT";

export type MrBeastLotteryErrorCode =
  | "LOTTERY_DISABLED"
  | "LOTTERY_MISCONFIGURED"
  | "NO_LOTTERY_TICKET"
  | "LOTTERY_CLAIM_NOT_FOUND"
  | "LOTTERY_CLAIM_INVALID";

export interface MrBeastLotteryPendingClaimDto {
  claimId: string;
  eventId: string;
  createdAt: string;
}

export interface MrBeastLotteryRevealDto {
  claimId: string;
  tier: MrBeastLotteryTier;
  label: string;
  reward: number;
  prizeTableVersion: string;
  announcementCandidate: boolean;
  revealedAt: string;
  balance: number | null;
}

export interface MrBeastLotteryStateDto {
  /** UI 노출 여부. 활성 배포 기간 또는 기존 AVAILABLE/PENDING 권리가 있으면 true. */
  enabled: boolean;
  /** 신규 티켓 배포가 가능한 현재 설정 기간인지 여부. */
  active: boolean;
  eventId: string | null;
  availableTickets: number;
  pendingClaim: MrBeastLotteryPendingClaimDto | null;
  recentWinners: MrBeastLotteryWinnerDto[];
}

export interface MrBeastLotteryWinnerDto {
  claimId: string;
  characterCodename: string;
  tier: "second" | "first" | "zeroth";
  label: string;
  reward: number;
  revealedAt: string;
}

export interface MrBeastLotteryConfigDoc {
  _id: typeof LOTTERY_CONFIG_ID;
  enabled: boolean;
  eventId: string;
  startAt: Date;
  endAt: Date;
  version: number;
  grantFenceVersion?: number;
  updatedAt: Date;
  updatedById: string;
  updatedByName: string;
}

export interface MrBeastLotteryAdminConfigDto {
  enabled: boolean;
  active: boolean;
  eventId: string;
  startAt: string | null;
  endAt: string | null;
  version: number;
  updatedAt: string | null;
  updatedByName: string | null;
  readiness: MrBeastLotteryReadinessDto;
}

export interface MrBeastLotteryReadinessDto {
  ready: boolean;
  indexesReady: boolean;
  masterItemReady: boolean;
  issues: string[];
}

interface MrBeastLotteryClaim {
  _id: ObjectId;
  entitlementId: ObjectId;
  eventId: string;
  characterId: string;
  characterCodename: string;
  characterIsPublic: boolean;
  ownerId: string;
  ownerName: string;
  ownerHistory?: Array<{
    ownerId: string;
    ownerName: string;
    reassignedAt: Date;
  }>;
  status: "PENDING" | "REVEALED";
  bucket: number;
  tier: MrBeastLotteryTier;
  label: string;
  reward: number;
  prizeTableVersion: string;
  createdAt: Date;
  revealedAt?: Date;
  creditTransactionId?: string;
  balanceAfter?: number;
}

interface MrBeastLotteryEntitlement {
  _id: ObjectId;
  eventId: string;
  characterId: string;
  sourceRequestId: string;
  ordinal: number;
  prizeTableVersion: string;
  status: "AVAILABLE" | "CLAIMED";
  grantedAt: Date;
  claimId?: string;
  claimedAt?: Date;
}

interface LotteryNotification {
  userId: string;
  dedupeKey: string;
  type: "CREDIT_RECEIVED" | "SYSTEM";
  title: string;
  message: string;
  link: string;
  isRead: false;
  createdAt: Date;
}

export class MrBeastLotteryError extends Error {
  readonly code: MrBeastLotteryErrorCode;

  constructor(code: MrBeastLotteryErrorCode, message: string) {
    super(message);
    this.name = "MrBeastLotteryError";
    this.code = code;
  }
}

async function claimsCol(): Promise<Collection<MrBeastLotteryClaim>> {
  const db = await getDb();
  return db.collection<MrBeastLotteryClaim>(LOTTERY_CLAIMS_COLLECTION);
}

async function entitlementsCol(): Promise<
  Collection<MrBeastLotteryEntitlement>
> {
  const db = await getDb();
  return db.collection<MrBeastLotteryEntitlement>(
    LOTTERY_ENTITLEMENTS_COLLECTION,
  );
}

async function lotteryConfigCol(): Promise<
  Collection<MrBeastLotteryConfigDoc>
> {
  const db = await getDb();
  return db.collection<MrBeastLotteryConfigDoc>(LOTTERY_CONFIG_COLLECTION);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function toMrBeastLotteryConfig(
  doc: MrBeastLotteryConfigDoc | null,
  now: Date,
): MrBeastLotteryConfig {
  const eventId =
    typeof doc?.eventId === "string" &&
    isSafeMrBeastLotteryEventId(doc.eventId)
      ? doc.eventId
      : null;
  const startAt = validDate(doc?.startAt) ? doc.startAt : null;
  const endAt = validDate(doc?.endAt) ? doc.endAt : null;
  const config: MrBeastLotteryConfig = {
    enabled: doc?.enabled === true,
    active: false,
    version:
      Number.isSafeInteger(doc?.version) && Number(doc?.version) >= 1
        ? Number(doc?.version)
        : 0,
    eventId,
    startAt,
    endAt,
    prizeTableVersion: MRBEAST_LOTTERY_PRIZE_TABLE_VERSION,
  };
  config.active = isMrBeastLotteryActive(config, now);
  return config;
}

export async function getMrBeastLotteryConfig(
  now: Date = new Date(),
  options: { session?: ClientSession } = {},
): Promise<MrBeastLotteryConfig> {
  const doc = await (await lotteryConfigCol()).findOne(
    { _id: LOTTERY_CONFIG_ID },
    { session: options.session },
  );
  return toMrBeastLotteryConfig(doc, now);
}

export async function updateMrBeastLotteryConfig(input: {
  enabled: boolean;
  eventId: string;
  startAt: Date;
  endAt: Date;
  expectedVersion: number;
  updatedById: string;
  updatedByName: string;
  now?: Date;
  session?: ClientSession;
}): Promise<MrBeastLotteryConfigDoc | null> {
  const now = input.now ?? new Date();
  try {
    return await (await lotteryConfigCol()).findOneAndUpdate(
      {
        _id: LOTTERY_CONFIG_ID,
        version: input.expectedVersion,
      },
      {
        $set: {
          enabled: input.enabled,
          eventId: input.eventId,
          startAt: input.startAt,
          endAt: input.endAt,
          updatedAt: now,
          updatedById: input.updatedById,
          updatedByName: input.updatedByName,
        },
        $inc: { version: 1 },
      },
      {
        upsert: input.expectedVersion === 0,
        returnDocument: "after",
        session: input.session,
      },
    );
  } catch (error) {
    // 동시에 최초 설정을 저장한 경우 deterministic _id 충돌을 version 충돌로 취급한다.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * 신규 복권 지급 transaction과 GM 설정 변경을 같은 singleton 문서의 write로
 * 직렬화한다. MongoDB가 write conflict를 재시도하면 새 snapshot에서 활성
 * 기간과 version을 다시 검증하므로, 비활성화가 먼저 확정된 뒤 지급되지 않는다.
 */
export async function fenceActiveMrBeastLotteryConfigForGrant(input: {
  expectedEventId: string;
  expectedVersion: number;
  now: Date;
  session: ClientSession;
}): Promise<MrBeastLotteryConfig | null> {
  const doc = await (await lotteryConfigCol()).findOneAndUpdate(
    {
      _id: LOTTERY_CONFIG_ID,
      enabled: true,
      eventId: input.expectedEventId,
      version: input.expectedVersion,
      startAt: { $lte: input.now },
      endAt: { $gt: input.now },
    },
    { $inc: { grantFenceVersion: 1 } },
    {
      returnDocument: "after",
      session: input.session,
    },
  );
  if (!doc) return null;
  const config = toMrBeastLotteryConfig(doc, input.now);
  return config.active ? config : null;
}

export interface RequiredLotteryIndex {
  collection: typeof LOTTERY_CLAIMS_COLLECTION | typeof LOTTERY_ENTITLEMENTS_COLLECTION;
  name: string;
  key: ReadonlyArray<readonly [string, 1 | -1]>;
  unique: boolean;
  partialFilterExpression: Record<string, unknown> | null;
}

export const REQUIRED_LOTTERY_INDEXES: readonly RequiredLotteryIndex[] = [
  {
    collection: LOTTERY_CLAIMS_COLLECTION,
    name: "mrbeast_lottery_claims_pending_character_global_unique",
    key: [["characterId", 1]],
    unique: true,
    partialFilterExpression: { status: "PENDING" },
  },
  {
    collection: LOTTERY_CLAIMS_COLLECTION,
    name: "mrbeast_lottery_claims_winners_recent",
    key: [
      ["status", 1],
      ["tier", 1],
      ["characterIsPublic", 1],
      ["revealedAt", -1],
      ["_id", -1],
    ],
    unique: false,
    partialFilterExpression: null,
  },
  {
    collection: LOTTERY_ENTITLEMENTS_COLLECTION,
    name: "mrbeast_lottery_entitlements_source_ordinal_unique",
    key: [
      ["eventId", 1],
      ["sourceRequestId", 1],
      ["ordinal", 1],
    ],
    unique: true,
    partialFilterExpression: null,
  },
  {
    collection: LOTTERY_ENTITLEMENTS_COLLECTION,
    name: "mrbeast_lottery_entitlements_character_available_fifo",
    key: [
      ["characterId", 1],
      ["status", 1],
      ["grantedAt", 1],
      ["_id", 1],
    ],
    unique: false,
    partialFilterExpression: null,
  },
  {
    collection: LOTTERY_ENTITLEMENTS_COLLECTION,
    name: "mrbeast_lottery_entitlements_claim_unique",
    key: [["claimId", 1]],
    unique: true,
    partialFilterExpression: { claimId: { $type: "string" } },
  },
] as const;

const LOTTERY_INDEX_READINESS_CACHE_MS = 30_000;
let lotteryIndexesReadyUntil = 0;
let lotteryIndexReadinessPromise: Promise<void> | null = null;

function indexMatchesRequirement(
  index: IndexDescriptionInfo,
  requirement: RequiredLotteryIndex,
): boolean {
  const actualKey = Object.entries(index.key).map(([field, direction]) => [
    field,
    direction,
  ]);
  return (
    index.name === requirement.name &&
    JSON.stringify(actualKey) === JSON.stringify(requirement.key) &&
    Boolean(index.unique) === requirement.unique &&
    JSON.stringify(index.partialFilterExpression ?? null) ===
      JSON.stringify(requirement.partialFilterExpression)
  );
}

async function validateMrBeastLotteryIndexes(): Promise<void> {
  const db = await getDb();
  let claimIndexes: IndexDescriptionInfo[];
  let entitlementIndexes: IndexDescriptionInfo[];
  try {
    [claimIndexes, entitlementIndexes] = await Promise.all([
      db.collection(LOTTERY_CLAIMS_COLLECTION).listIndexes().toArray(),
      db.collection(LOTTERY_ENTITLEMENTS_COLLECTION).listIndexes().toArray(),
    ]);
  } catch (error) {
    console.error("[mrbeast-lottery] index readiness lookup failed", error);
    throw new MrBeastLotteryError(
      "LOTTERY_MISCONFIGURED",
      "복권 필수 인덱스를 확인할 수 없습니다.",
    );
  }

  const indexesByCollection = {
    [LOTTERY_CLAIMS_COLLECTION]: claimIndexes,
    [LOTTERY_ENTITLEMENTS_COLLECTION]: entitlementIndexes,
  };
  const invalid = REQUIRED_LOTTERY_INDEXES.find(
    (requirement) =>
      !indexesByCollection[requirement.collection].some((index) =>
        indexMatchesRequirement(index, requirement),
      ),
  );
  if (invalid) {
    console.error(
      "[mrbeast-lottery] required index missing or mismatched",
      invalid.name,
    );
    throw new MrBeastLotteryError(
      "LOTTERY_MISCONFIGURED",
      "복권 필수 인덱스 설정을 확인할 수 없습니다.",
    );
  }
}

/**
 * 성공 결과만 짧게 캐시한다. 실패는 캐시하지 않아 인덱스 적용 직후 다음 요청이
 * 즉시 readiness를 다시 확인한다. 이 함수는 listIndexes만 수행하며 생성하지 않는다.
 */
export async function assertMrBeastLotteryIndexesReady(): Promise<void> {
  if (Date.now() < lotteryIndexesReadyUntil) return;
  if (!lotteryIndexReadinessPromise) {
    lotteryIndexReadinessPromise = validateMrBeastLotteryIndexes()
      .then(() => {
        lotteryIndexesReadyUntil =
          Date.now() + LOTTERY_INDEX_READINESS_CACHE_MS;
      })
      .finally(() => {
        lotteryIndexReadinessPromise = null;
      });
  }
  return lotteryIndexReadinessPromise;
}

export function isMrBeastLotteryTicketMasterReady(master: {
  _id?: unknown;
  slug?: string;
  category?: string;
  price?: number | string;
  previewImage?: string;
  isAvailable?: boolean;
  isPublic?: boolean;
} | null | undefined): boolean {
  return (
    Boolean(master?._id) &&
    master?.slug === MRBEAST_LOTTERY_SLUG &&
    master.category === "CONSUMABLE" &&
    Number(master.price) === 0 &&
    master.previewImage ===
      "/assets/shop/events/mrbeast-lottery-transparent.png" &&
    master.isAvailable === false &&
    master.isPublic === false
  );
}

export async function getMrBeastLotteryReadiness(
  options: { freshIndexes?: boolean } = {},
): Promise<MrBeastLotteryReadinessDto> {
  let indexesReady = false;
  let masterItemReady = false;
  const issues: string[] = [];

  try {
    if (options.freshIndexes) {
      await validateMrBeastLotteryIndexes();
    } else {
      await assertMrBeastLotteryIndexesReady();
    }
    indexesReady = true;
  } catch {
    issues.push("복권 필수 인덱스가 누락되었거나 설정과 다릅니다.");
  }

  try {
    const master = await findMasterItemBySlug(MRBEAST_LOTTERY_SLUG);
    masterItemReady = isMrBeastLotteryTicketMasterReady(master);
    if (!masterItemReady) {
      issues.push(
        "비공개 복권 마스터 아이템이 canonical 안전 조건과 다릅니다.",
      );
    }
  } catch (error) {
    console.error("[mrbeast-lottery] master item readiness lookup failed", error);
    issues.push("복권 마스터 아이템 준비 상태를 확인할 수 없습니다.");
  }

  return {
    ready: indexesReady && masterItemReady,
    indexesReady,
    masterItemReady,
    issues,
  };
}

export function serializeMrBeastLotteryAdminConfig(
  doc: MrBeastLotteryConfigDoc | null,
  readiness: MrBeastLotteryReadinessDto,
  now: Date = new Date(),
): MrBeastLotteryAdminConfigDto {
  const config = toMrBeastLotteryConfig(doc, now);
  return {
    enabled: config.enabled,
    active: config.active,
    eventId: config.eventId ?? "",
    startAt: config.startAt?.toISOString() ?? null,
    endAt: config.endAt?.toISOString() ?? null,
    version: config.version,
    updatedAt: validDate(doc?.updatedAt) ? doc.updatedAt.toISOString() : null,
    updatedByName:
      typeof doc?.updatedByName === "string" ? doc.updatedByName : null,
    readiness,
  };
}

export async function getMrBeastLotteryAdminConfig(
  now: Date = new Date(),
): Promise<MrBeastLotteryAdminConfigDto> {
  const [doc, readiness] = await Promise.all([
    (await lotteryConfigCol()).findOne({ _id: LOTTERY_CONFIG_ID }),
    getMrBeastLotteryReadiness(),
  ]);
  return serializeMrBeastLotteryAdminConfig(doc, readiness, now);
}

function requireActiveEvent(config: MrBeastLotteryConfig): string {
  if (!config.active || !config.eventId) {
    throw new MrBeastLotteryError(
      "LOTTERY_DISABLED",
      "미스터비스트 복권 이벤트가 활성화되지 않았습니다.",
    );
  }
  return config.eventId;
}

function serializePendingClaim(
  claim: MrBeastLotteryClaim,
): MrBeastLotteryPendingClaimDto {
  return {
    claimId: claim._id.toHexString(),
    eventId: claim.eventId,
    createdAt: claim.createdAt.toISOString(),
  };
}

function serializeReveal(
  claim: MrBeastLotteryClaim,
): MrBeastLotteryRevealDto {
  if (claim.status !== "REVEALED" || !claim.revealedAt) {
    throw new MrBeastLotteryError(
      "LOTTERY_CLAIM_INVALID",
      "아직 공개되지 않은 복권 결과입니다.",
    );
  }
  return {
    claimId: claim._id.toHexString(),
    tier: claim.tier,
    label: claim.label,
    reward: claim.reward,
    prizeTableVersion: claim.prizeTableVersion,
    announcementCandidate: isMrBeastLotteryAnnouncementCandidate(claim.tier),
    revealedAt: claim.revealedAt.toISOString(),
    balance: claim.balanceAfter ?? null,
  };
}

function serializeWinner(
  claim: MrBeastLotteryClaim,
): MrBeastLotteryWinnerDto {
  if (
    claim.tier !== "second" &&
    claim.tier !== "first" &&
    claim.tier !== "zeroth"
  ) {
    throw new Error("Non-announcement tier cannot be serialized as a winner");
  }
  return {
    claimId: claim._id.toHexString(),
    characterCodename: claim.characterCodename,
    tier: claim.tier,
    label: claim.label,
    reward: claim.reward,
    revealedAt: claim.revealedAt?.toISOString() ?? claim.createdAt.toISOString(),
  };
}

async function countAvailableEntitlements(
  characterId: string,
  session: ClientSession,
): Promise<number> {
  const entitlements = await entitlementsCol();
  return entitlements.countDocuments(
    { characterId, status: "AVAILABLE" },
    { session },
  );
}

/**
 * owner 변경과 복권 경제 mutation의 write-write conflict fence.
 * 전용 version을 실제 증가시키는 update를 transaction에 포함해, route 확인 뒤
 * owner가 바뀌면 write conflict 후 새 snapshot으로 재검증하거나 안전하게 거부한다.
 */
export async function fenceLotteryCharacterOwner(input: {
  characterId: string;
  ownerId: string;
  session: ClientSession;
}): Promise<{ isPublic: boolean }> {
  if (!ObjectId.isValid(input.characterId)) {
    throw new MrBeastLotteryError(
      "LOTTERY_CLAIM_INVALID",
      "복권 캐릭터 식별자가 올바르지 않습니다.",
    );
  }
  const db = await getDb();
  const character = await db
    .collection<{
      _id: ObjectId;
      ownerId?: string;
      isPublic?: boolean;
      lotteryEconomyFenceVersion?: number;
    }>(CHARACTERS_COLLECTION)
    .findOneAndUpdate(
      {
        _id: new ObjectId(input.characterId),
        ownerId: input.ownerId,
      },
      { $inc: { lotteryEconomyFenceVersion: 1 } },
      { returnDocument: "after", session: input.session },
    );
  if (!character) {
    throw new MrBeastLotteryError(
      "LOTTERY_CLAIM_INVALID",
      "복권 캐릭터의 현재 소유권을 확인할 수 없습니다.",
    );
  }
  return { isPublic: character.isPublic === true };
}

async function reconcileTicketInventoryMirror(input: {
  characterId: string;
  characterCodename: string;
  ticketItemId: string;
  acquiredAt: Date;
  session: ClientSession;
}): Promise<number> {
  const available = await countAvailableEntitlements(
    input.characterId,
    input.session,
  );
  const inventory = await characterInventoryCol();
  if (available === 0) {
    await inventory.deleteOne(
      { characterId: input.characterId, itemId: input.ticketItemId },
      { session: input.session },
    );
    return 0;
  }

  await inventory.updateOne(
    { characterId: input.characterId, itemId: input.ticketItemId },
    {
      $set: {
        quantity: available,
        characterCodename: input.characterCodename,
        itemName: "미스터비스트 복권",
      },
      $setOnInsert: {
        acquiredAt: input.acquiredAt,
        note: "복권 entitlement 표시용 mirror",
      },
    },
    { upsert: true, session: input.session },
  );
  return available;
}

export async function grantMrBeastLotteryTicketsForPurchase(input: {
  config: MrBeastLotteryConfig;
  characterId: string;
  characterCodename: string;
  ticketItemId: string;
  sourceRequestId: string;
  quantity: number;
  acquiredAt: Date;
  session: ClientSession;
}): Promise<number> {
  if (!input.config.active || !input.config.eventId || input.quantity === 0) {
    return 0;
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
    throw new Error("Lottery ticket grant quantity must be a positive integer");
  }
  if (!input.session.inTransaction()) {
    throw new Error("Lottery tickets must be granted in the purchase transaction");
  }

  const eventId = requireActiveEvent(input.config);
  const entitlements = await entitlementsCol();
  await entitlements.insertMany(
    Array.from({ length: input.quantity }, (_, ordinal) => ({
      _id: new ObjectId(),
      eventId,
      characterId: input.characterId,
      sourceRequestId: input.sourceRequestId,
      ordinal,
      prizeTableVersion: input.config.prizeTableVersion,
      status: "AVAILABLE" as const,
      grantedAt: input.acquiredAt,
    })),
    { session: input.session },
  );

  // character_inventory는 표시용 mirror다. 경제 권리 판정은 entitlement만 사용한다.
  await addToInventory(
    {
      characterId: input.characterId,
      characterCodename: input.characterCodename,
      itemId: input.ticketItemId,
      itemName: "미스터비스트 복권",
      quantity: input.quantity,
      acquiredAt: input.acquiredAt,
      note: `이벤트 ${eventId} · 미스터비스트 소다 구매 보너스`,
    },
    { session: input.session },
  );
  await reconcileTicketInventoryMirror({
    characterId: input.characterId,
    characterCodename: input.characterCodename,
    ticketItemId: input.ticketItemId,
    acquiredAt: input.acquiredAt,
    session: input.session,
  });
  return input.quantity;
}

export async function getMrBeastLotteryState(
  config: MrBeastLotteryConfig,
  characterId: string,
): Promise<MrBeastLotteryStateDto> {
  const [availableTickets, pendingClaim, recentWinners] = await Promise.all([
    entitlementsCol().then((collection) =>
      collection.countDocuments({ characterId, status: "AVAILABLE" }),
    ),
    claimsCol().then((collection) =>
      collection.findOne(
        { characterId, status: "PENDING" },
        { sort: { createdAt: 1, _id: 1 } },
      ),
    ),
    listRecentMrBeastLotteryWinners(),
  ]);

  return {
    enabled:
      config.active || availableTickets > 0 || pendingClaim !== null,
    active: config.active,
    eventId: config.eventId,
    availableTickets,
    pendingClaim: pendingClaim ? serializePendingClaim(pendingClaim) : null,
    recentWinners,
  };
}

export async function listRecentMrBeastLotteryWinners(): Promise<
  MrBeastLotteryWinnerDto[]
> {
  const collection = await claimsCol();
  const winners = await collection
    .aggregate<MrBeastLotteryClaim>([
      {
        $match: {
          status: "REVEALED",
          tier: { $in: ["second", "first", "zeroth"] },
          characterIsPublic: true,
        },
      },
      { $sort: { revealedAt: -1, _id: -1 } },
      {
        $addFields: {
          _characterObjectId: {
            $convert: {
              input: "$characterId",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: "characters",
          localField: "_characterObjectId",
          foreignField: "_id",
          as: "_character",
        },
      },
      { $match: { "_character.isPublic": true } },
      { $limit: 5 },
      { $unset: ["_characterObjectId", "_character"] },
    ])
    .toArray();
  return winners.map(serializeWinner);
}

export async function startOrResumeMrBeastLotteryClaim(input: {
  characterId: string;
  characterCodename: string;
  characterIsPublic: boolean;
  ownerId: string;
  ownerName: string;
  ticketItemId: string;
  claimId: string;
  bucket: number;
  session: ClientSession;
}): Promise<{
  claim: MrBeastLotteryPendingClaimDto;
  resumed: boolean;
  availableTickets: number;
}> {
  if (!input.session.inTransaction()) {
    throw new Error("Lottery claims must start in a transaction");
  }
  if (!ObjectId.isValid(input.claimId)) {
    throw new MrBeastLotteryError(
      "LOTTERY_CLAIM_INVALID",
      "복권 claimId가 올바르지 않습니다.",
    );
  }

  await fenceLotteryCharacterOwner({
    characterId: input.characterId,
    ownerId: input.ownerId,
    session: input.session,
  });

  // entitlement 선택, pending unique, 표시 mirror 변경을 캐릭터·티켓 단위로 직렬화한다.
  await lockCharacterInventoryItems(
    input.characterId,
    [input.ticketItemId],
    input.session,
  );

  const collection = await claimsCol();
  const existing = await collection.findOne(
    { characterId: input.characterId, status: "PENDING" },
    { session: input.session, sort: { createdAt: 1, _id: 1 } },
  );
  if (existing) {
    return {
      claim: serializePendingClaim(existing),
      resumed: true,
      availableTickets: await countAvailableEntitlements(
        input.characterId,
        input.session,
      ),
    };
  }

  const entitlements = await entitlementsCol();
  const candidate = await entitlements.findOne(
    { characterId: input.characterId, status: "AVAILABLE" },
    {
      session: input.session,
      sort: { grantedAt: 1, _id: 1 },
    },
  );
  if (!candidate) {
    throw new MrBeastLotteryError(
      "NO_LOTTERY_TICKET",
      "사용할 수 있는 미스터비스트 복권이 없습니다.",
    );
  }

  let prize;
  try {
    // 알 수 없는 과거 버전은 entitlement를 CLAIMED로 바꾸기 전에 fail closed한다.
    prize = getMrBeastLotteryPrize(
      input.bucket,
      candidate.prizeTableVersion,
    );
  } catch (error) {
    console.error(
      "[mrbeast-lottery] unsupported stored prize table",
      candidate.prizeTableVersion,
      error,
    );
    throw new MrBeastLotteryError(
      "LOTTERY_MISCONFIGURED",
      "지원하지 않는 복권 확률표입니다.",
    );
  }

  const claimedAt = new Date();
  const entitlement = await entitlements.findOneAndUpdate(
    {
      _id: candidate._id,
      characterId: input.characterId,
      status: "AVAILABLE",
    },
    {
      $set: {
        status: "CLAIMED",
        claimId: input.claimId,
        claimedAt,
      },
    },
    { returnDocument: "after", session: input.session },
  );
  if (!entitlement) {
    throw new MrBeastLotteryError(
      "NO_LOTTERY_TICKET",
      "사용할 수 있는 미스터비스트 복권이 없습니다.",
    );
  }

  // generic inventory는 표시용 mirror이므로 drift가 있어도 entitlement 권리를 막지 않는다.
  await removeFromInventory(
    input.characterId,
    input.ticketItemId,
    1,
    { session: input.session },
  );
  const availableTickets = await reconcileTicketInventoryMirror({
    characterId: input.characterId,
    characterCodename: input.characterCodename,
    ticketItemId: input.ticketItemId,
    acquiredAt: claimedAt,
    session: input.session,
  });

  const claim: MrBeastLotteryClaim = {
    _id: new ObjectId(input.claimId),
    entitlementId: entitlement._id,
    eventId: entitlement.eventId,
    characterId: input.characterId,
    characterCodename: input.characterCodename,
    characterIsPublic: input.characterIsPublic,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    status: "PENDING",
    bucket: input.bucket,
    tier: prize.tier,
    label: prize.label,
    reward: prize.reward,
    prizeTableVersion: entitlement.prizeTableVersion,
    createdAt: claimedAt,
  };
  await collection.insertOne(claim, { session: input.session });

  return {
    claim: serializePendingClaim(claim),
    resumed: false,
    availableTickets,
  };
}

export async function revealMrBeastLotteryClaim(input: {
  claimId: string;
  characterId: string;
  ownerId: string;
  ownerName: string;
  session: ClientSession;
}): Promise<MrBeastLotteryRevealDto> {
  if (!input.session.inTransaction()) {
    throw new Error("Lottery claims must reveal in a transaction");
  }
  if (!ObjectId.isValid(input.claimId)) {
    throw new MrBeastLotteryError(
      "LOTTERY_CLAIM_NOT_FOUND",
      "복권 결과 청구를 찾을 수 없습니다.",
    );
  }

  const characterFence = await fenceLotteryCharacterOwner({
    characterId: input.characterId,
    ownerId: input.ownerId,
    session: input.session,
  });

  const collection = await claimsCol();
  const filter = {
    _id: new ObjectId(input.claimId),
    characterId: input.characterId,
  };
  const existing = await collection.findOne(filter, { session: input.session });
  if (!existing) {
    throw new MrBeastLotteryError(
      "LOTTERY_CLAIM_NOT_FOUND",
      "복권 결과 청구를 찾을 수 없습니다.",
    );
  }
  if (existing.status === "REVEALED") return serializeReveal(existing);

  const revealedAt = new Date();
  const ownerChanged = existing.ownerId !== input.ownerId;
  const revealed = await collection.findOneAndUpdate(
    { ...filter, status: "PENDING" },
    {
      $set: {
        status: "REVEALED",
        revealedAt,
        ownerId: input.ownerId,
        ownerName: input.ownerName,
      },
      ...(ownerChanged
        ? {
            $push: {
              ownerHistory: {
                ownerId: existing.ownerId,
                ownerName: existing.ownerName,
                reassignedAt: revealedAt,
              },
            },
          }
        : {}),
    },
    { returnDocument: "after", session: input.session },
  );
  if (!revealed) {
    const winner = await collection.findOne(filter, { session: input.session });
    if (winner?.status === "REVEALED") return serializeReveal(winner);
    throw new MrBeastLotteryError(
      "LOTTERY_CLAIM_INVALID",
      "복권 결과 상태가 올바르지 않습니다.",
    );
  }

  let balanceAfter: number | undefined;
  let creditTransactionId: string | undefined;
  if (revealed.reward > 0) {
    const credit = await addCredit({
      characterId: revealed.characterId,
      characterCodename: revealed.characterCodename,
      ownerId: revealed.ownerId,
      ownerName: revealed.ownerName,
      amount: revealed.reward,
      type: "EVENT_REWARD",
      description: `미스터비스트 복권 ${revealed.label} 보상`,
      metadata: {
        eventId: revealed.eventId,
        claimId: revealed._id.toHexString(),
        tier: revealed.tier,
        prizeTableVersion: revealed.prizeTableVersion,
      },
      createdById: SYSTEM_USER_ID_SENTINEL,
      createdByName: LOTTERY_EVENT_ACTOR_NAME,
      requestId: `mrbeast-lottery-reward:${revealed._id.toHexString()}`,
      session: input.session,
    });
    balanceAfter = credit.balance;
    creditTransactionId = credit._id?.toHexString();
  }

  const completed = await collection.findOneAndUpdate(
    { ...filter, status: "REVEALED" },
    {
      $set: {
        ...(balanceAfter !== undefined ? { balanceAfter } : {}),
        ...(creditTransactionId ? { creditTransactionId } : {}),
      },
    },
    { returnDocument: "after", session: input.session },
  );
  if (!completed) {
    throw new MrBeastLotteryError(
      "LOTTERY_CLAIM_INVALID",
      "복권 결과 저장에 실패했습니다.",
    );
  }

  const now = new Date();
  const db = await getDb();
  const notifications = db.collection<LotteryNotification>(
    NOTIFICATIONS_COLLECTION,
  );
  await notifications.insertOne(
    {
      userId: completed.ownerId,
      dedupeKey: `mrbeast-lottery-result:${completed._id.toHexString()}`,
      type: completed.reward > 0 ? "CREDIT_RECEIVED" : "SYSTEM",
      title: `미스터비스트 복권 ${completed.label}`,
      message:
        completed.reward > 0
          ? `${completed.characterCodename} · +${completed.reward.toLocaleString()} CR`
          : `${completed.characterCodename} · 다음 기회에 도전하세요.`,
      link: "/erp/shop",
      isRead: false,
      createdAt: now,
    },
    { session: input.session },
  );

  if (
    characterFence.isPublic &&
    isMrBeastLotteryAnnouncementCandidate(completed.tier)
  ) {
    await enqueueMrBeastLotteryWinnerWebhook(
      {
        claimId: completed._id.toHexString(),
        eventId: completed.eventId,
        character: {
          id: completed.characterId,
          codename: completed.characterCodename,
        },
        tier: completed.tier,
        label: completed.label,
        reward: completed.reward,
        revealedAt: completed.revealedAt ?? now,
      },
      `mrbeast-lottery-winner:${completed._id.toHexString()}`,
      { session: input.session },
    );
  }

  return serializeReveal(completed);
}
