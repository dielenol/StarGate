import { randomUUID } from "node:crypto";

import { ObjectId, type Collection } from "mongodb";

import {
  getClient,
  getDb,
  masterItemsCol,
  type MasterItem,
} from "@stargate/shared-db";

import type { GmAdminAuditWebhookPayload } from "@/lib/discord";

import {
  getMrBeastLotteryReadiness,
  isMrBeastLotteryTicketMasterReady,
  REQUIRED_LOTTERY_INDEXES,
  type MrBeastLotteryReadinessDto,
  type RequiredLotteryIndex,
} from "@/lib/db/mrbeast-lottery";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { MRBEAST_LOTTERY_SLUG } from "@/lib/shop/mrbeast-lottery";
import lotteryMasterItemSeed from "@/scripts/seed-payloads/consumable-mrbeast-lottery-2026-07-31.json";

const LOTTERY_INFRASTRUCTURE_ID = "mrbeast-lottery-infrastructure-v1";
const LOTTERY_MASTER_ITEM_ID = new ObjectId("6d7262656173746c6f747465");
const PREPARATION_LEASE_MS = 5 * 60 * 1000;
const PREPARATION_HEARTBEAT_MS = 60 * 1000;

const LOTTERY_MASTER_ITEM_CANONICAL = Object.fromEntries(
  Object.entries(lotteryMasterItemSeed.payload).filter(
    ([key]) => key !== "createdAt" && key !== "updatedAt",
  ),
) as Record<string, unknown>;

interface LotteryInfrastructureOperation {
  _id: typeof LOTTERY_INFRASTRUCTURE_ID;
  status: "PREPARING" | "READY" | "FAILED";
  attempt: number;
  operationToken?: string;
  leaseUntil?: Date;
  readiness?: MrBeastLotteryReadinessDto;
  startedAt: Date;
  completedAt?: Date;
  updatedById: string;
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MrBeastLotteryPreparationResult {
  changed: boolean;
  readiness: MrBeastLotteryReadinessDto;
}

export class MrBeastLotteryPreparationError extends Error {
  readonly readiness: MrBeastLotteryReadinessDto;
  readonly setupInProgress: boolean;

  constructor(
    message: string,
    readiness: MrBeastLotteryReadinessDto,
    options: { setupInProgress?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "MrBeastLotteryPreparationError";
    this.readiness = readiness;
    this.setupInProgress = options.setupInProgress === true;
  }
}

async function infrastructureCol(): Promise<
  Collection<LotteryInfrastructureOperation>
> {
  const db = await getDb();
  return db.collection<LotteryInfrastructureOperation>("shop_runtime_state");
}

function groupIndexRequirements(): Map<
  RequiredLotteryIndex["collection"],
  RequiredLotteryIndex[]
> {
  const grouped = new Map<
    RequiredLotteryIndex["collection"],
    RequiredLotteryIndex[]
  >();
  for (const requirement of REQUIRED_LOTTERY_INDEXES) {
    const requirements = grouped.get(requirement.collection);
    if (requirements) {
      requirements.push(requirement);
    } else {
      grouped.set(requirement.collection, [requirement]);
    }
  }
  return grouped;
}

async function createRequiredIndexes(): Promise<void> {
  const db = await getDb();
  for (const [collectionName, requirements] of groupIndexRequirements()) {
    await db.collection(collectionName).createIndexes(
      requirements.map((requirement) => ({
        key: Object.fromEntries(requirement.key),
        name: requirement.name,
        ...(requirement.unique ? { unique: true } : {}),
        ...(requirement.partialFilterExpression
          ? {
              partialFilterExpression:
                requirement.partialFilterExpression,
            }
          : {}),
      })),
    );
  }
}

async function renewPreparationLease(operationToken: string): Promise<void> {
  const now = new Date();
  const renewed = await (await infrastructureCol()).updateOne(
    {
      _id: LOTTERY_INFRASTRUCTURE_ID,
      operationToken,
      status: "PREPARING",
    },
    {
      $set: {
        leaseUntil: new Date(now.getTime() + PREPARATION_LEASE_MS),
        updatedAt: now,
      },
    },
  );
  if (renewed.matchedCount !== 1) {
    throw new Error("LOTTERY_PREPARATION_LEASE_LOST");
  }
}

function startPreparationHeartbeat(operationToken: string): () => Promise<void> {
  let heartbeatFailure: unknown = null;
  let inFlight: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (inFlight || heartbeatFailure) return;
    inFlight = renewPreparationLease(operationToken)
      .catch((error) => {
        heartbeatFailure = error;
      })
      .finally(() => {
        inFlight = null;
      });
  }, PREPARATION_HEARTBEAT_MS);

  return async () => {
    clearInterval(timer);
    await inFlight;
    if (heartbeatFailure) throw heartbeatFailure;
    await renewPreparationLease(operationToken);
  };
}

async function claimPreparation(input: {
  actor: GmAdminAuditWebhookPayload["actor"];
  now: Date;
  operationToken: string;
}): Promise<boolean> {
  const operations = await infrastructureCol();
  try {
    const claimed = await operations.findOneAndUpdate(
      {
        _id: LOTTERY_INFRASTRUCTURE_ID,
        $or: [
          { status: { $ne: "PREPARING" } },
          { leaseUntil: { $lte: input.now } },
        ],
      },
      {
        $set: {
          status: "PREPARING",
          operationToken: input.operationToken,
          leaseUntil: new Date(input.now.getTime() + PREPARATION_LEASE_MS),
          startedAt: input.now,
          updatedAt: input.now,
          updatedById: input.actor.id,
          updatedByName: input.actor.displayName,
        },
        $setOnInsert: {
          createdAt: input.now,
        },
        $inc: { attempt: 1 },
        $unset: {
          completedAt: "",
          readiness: "",
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    return claimed?.operationToken === input.operationToken;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    ) {
      return false;
    }
    throw error;
  }
}

async function recordPreparationFailure(input: {
  operationToken: string;
  readiness: MrBeastLotteryReadinessDto;
  now: Date;
}): Promise<void> {
  await (await infrastructureCol()).updateOne(
    {
      _id: LOTTERY_INFRASTRUCTURE_ID,
      operationToken: input.operationToken,
      status: "PREPARING",
    },
    {
      $set: {
        status: "FAILED",
        readiness: input.readiness,
        completedAt: input.now,
        updatedAt: input.now,
      },
      $unset: {
        operationToken: "",
        leaseUntil: "",
      },
    },
  );
}

/**
 * GM이 이벤트를 처음 열기 전에 한 번 실행하는 재시작 가능한 준비 작업.
 * 기존 인덱스를 삭제하거나 교체하지 않으며, 이미 READY면 DB를 변경하지 않는다.
 */
export async function prepareMrBeastLotteryInfrastructure(input: {
  actor: GmAdminAuditWebhookPayload["actor"];
}): Promise<MrBeastLotteryPreparationResult> {
  const initialReadiness = await getMrBeastLotteryReadiness({
    freshIndexes: true,
  });
  const previousOperation = await (await infrastructureCol()).findOne({
    _id: LOTTERY_INFRASTRUCTURE_ID,
  });
  if (
    initialReadiness.ready &&
    (!previousOperation || previousOperation.status === "READY")
  ) {
    return { changed: false, readiness: initialReadiness };
  }

  const operationToken = randomUUID();
  const startedAt = new Date();
  const claimed = await claimPreparation({
    actor: input.actor,
    now: startedAt,
    operationToken,
  });
  if (!claimed) {
    throw new MrBeastLotteryPreparationError(
      "다른 GM이 복권 운영 기반을 준비하고 있습니다.",
      initialReadiness,
      { setupInProgress: true },
    );
  }

  try {
    const stopHeartbeat = startPreparationHeartbeat(operationToken);
    try {
      await createRequiredIndexes();
    } finally {
      await stopHeartbeat();
    }
    const postIndexReadiness = await getMrBeastLotteryReadiness({
      freshIndexes: true,
    });
    if (!postIndexReadiness.indexesReady) {
      throw new Error("LOTTERY_INDEX_PREPARATION_FAILED");
    }

    const client = await getClient();
    const mongoSession = client.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        const now = new Date();
        const preparedMaster = await (await masterItemsCol()).findOneAndUpdate(
          { slug: MRBEAST_LOTTERY_SLUG },
          {
            $set: {
              ...LOTTERY_MASTER_ITEM_CANONICAL,
              updatedAt: now,
            } as Partial<MasterItem>,
            $setOnInsert: {
              _id: LOTTERY_MASTER_ITEM_ID,
              createdAt: now,
            },
          },
          {
            upsert: true,
            returnDocument: "after",
            session: mongoSession,
          },
        );
        if (!isMrBeastLotteryTicketMasterReady(preparedMaster)) {
          throw new Error("LOTTERY_MASTER_ITEM_PREPARATION_FAILED");
        }

        const completedAt = new Date();
        const readiness: MrBeastLotteryReadinessDto = {
          ready: true,
          indexesReady: true,
          masterItemReady: true,
          issues: [],
        };
        const operationUpdate = await (await infrastructureCol()).updateOne(
          {
            _id: LOTTERY_INFRASTRUCTURE_ID,
            operationToken,
            status: "PREPARING",
          },
          {
            $set: {
              status: "READY",
              readiness,
              completedAt,
              updatedAt: completedAt,
            },
            $unset: {
              operationToken: "",
              leaseUntil: "",
            },
          },
          { session: mongoSession },
        );
        if (operationUpdate.matchedCount !== 1) {
          throw new Error("LOTTERY_PREPARATION_LEASE_LOST");
        }

        await scheduleGmAdminAudit(
          {
            action: "미스터비스트 복권 운영 기반 준비",
            actor: input.actor,
            summary: "복권 전용 인덱스 5개와 비공개 마스터 아이템 준비",
            target: "띠아 편의점 미스터비스트 복권",
            timestamp: completedAt,
          },
          { session: mongoSession },
        );
      });
    } finally {
      await mongoSession.endSession();
    }

    return {
      changed: true,
      readiness: {
        ready: true,
        indexesReady: true,
        masterItemReady: true,
        issues: [],
      },
    };
  } catch (error) {
    const readiness = await getMrBeastLotteryReadiness({
      freshIndexes: true,
    });
    await recordPreparationFailure({
      operationToken,
      readiness,
      now: new Date(),
    }).catch((recordError) => {
      console.error(
        "[mrbeast-lottery-setup] failure record update failed",
        recordError,
      );
    });
    throw new MrBeastLotteryPreparationError(
      "복권 운영 기반 준비 중 오류가 발생했습니다.",
      readiness,
      { cause: error },
    );
  }
}
