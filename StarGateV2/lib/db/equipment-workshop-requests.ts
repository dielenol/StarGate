import "server-only";
import "./init";

import { getDb } from "@stargate/shared-db";
import type { ClientSession } from "mongodb";
import type { EquipmentSlot, ItemCategory } from "@stargate/shared-db/types";

import type {
  EquipmentWorkshopRequestStatus,
  EquipmentWorkshopRequestKind,
  EquipmentWorkshopEscrow,
  EquipmentWorkshopQuote,
  EquipmentWorkshopReload,
  SerializedEquipmentWorkshopRequest,
  AdminSerializedEquipmentWorkshopRequest,
} from "@/lib/equipment-shop/workshop-request";
import {
  EQUIPMENT_WORKSHOP_ACTIVE_STATUSES,
  EQUIPMENT_WORKSHOP_TERMINAL_STATUSES,
  getEquipmentWorkshopComputedStatus,
  mergeEquipmentWorkshopRequestLists,
} from "@/lib/equipment-shop/workshop-request";
import {
  createEquipmentWorkshopDiscordDmOutboxEvent,
  createEquipmentWorkshopStatusDmOutboxEvents,
  type EquipmentWorkshopDiscordDmOutboxEvent,
} from "@/lib/equipment-shop/workshop-discord-dm-outbox";

export interface EquipmentWorkshopRequestDoc {
  _id: string;
  kind: EquipmentWorkshopRequestKind;
  userId: string;
  userName: string;
  characterId: string;
  characterCodename: string;
  inventoryEntryId?: string;
  sourceItemId?: string;
  sourceCategory?: ItemCategory;
  sourceSlot?: EquipmentSlot;
  sourceDamage?: string;
  sourcePreviewImage?: string;
  equipmentName?: string;
  details: string;
  status: EquipmentWorkshopRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt?: Date;
  reviewedById?: string;
  reviewedByName?: string;
  operatorNote?: string;
  internalNote?: string;
  quote?: Omit<EquipmentWorkshopQuote, "issuedAt"> & { issuedAt: Date };
  escrow?: EquipmentWorkshopEscrow;
  reload?: EquipmentWorkshopReload;
  /** 진행 중인 동일 장비 작업을 막는 내부 unique key. */
  activeOperationKey?: string;
  startedAt?: Date;
  readyAt?: Date;
  claimedAt?: Date;
  approvalVoteId?: string;
  approvalOutcome?: "APPROVED" | "REJECTED";
  approvalResolvedAt?: Date;
  reloadedAt?: Date;
  discordDmOutbox?: EquipmentWorkshopDiscordDmOutboxEvent[];
  discordDmDelivery?: {
    leaseToken?: string;
    leaseUntil?: Date;
    nextAttemptAt?: Date;
    failedAt?: Date;
    lastError?: string;
  };
  history?: EquipmentWorkshopRequestHistoryEntry[];
}

interface EquipmentWorkshopRequestHistoryEntry {
  status: EquipmentWorkshopRequestStatus;
  at: Date;
  actorId: string;
  actorName: string;
  note?: string;
  quoteVersion?: number;
}

export async function equipmentWorkshopRequestsCol() {
  const db = await getDb();
  return db.collection<EquipmentWorkshopRequestDoc>(
    "equipment_workshop_requests",
  );
}

function serializeEquipmentWorkshopQuote(
  quote: NonNullable<EquipmentWorkshopRequestDoc["quote"]>,
  includeIssuer: boolean,
): EquipmentWorkshopQuote {
  const materials = quote.materials.map((material) => {
    const unitPrice = Number(material.unitPrice ?? 0);
    const subtotal = Number(
      (material.subtotal ?? unitPrice * material.quantity).toFixed(2),
    );
    return { ...material, unitPrice, subtotal };
  });
  const materialCost = Number(
    (quote.materialCost
      ?? materials.reduce((total, material) => total + material.subtotal, 0)
    ).toFixed(2),
  );
  const totalCost = Number(
    (quote.totalCost ?? materialCost + quote.creditCost).toFixed(2),
  );
  const serialized: EquipmentWorkshopQuote = {
    ...quote,
    modificationDomain: quote.modificationDomain ?? "GENERAL",
    materials,
    materialCost,
    totalCost,
    issuedAt: quote.issuedAt.toISOString(),
  };
  if (!includeIssuer) {
    delete serialized.issuedById;
    delete serialized.issuedByName;
  }
  return serialized;
}

export function serializeEquipmentWorkshopRequest(
  request: EquipmentWorkshopRequestDoc,
): SerializedEquipmentWorkshopRequest {
  const {
    createdAt,
    updatedAt,
    reviewedAt,
    history,
    quote,
    startedAt,
    readyAt,
    claimedAt,
    approvalResolvedAt,
    reloadedAt,
    discordDmOutbox: _discordDmOutbox,
    discordDmDelivery: _discordDmDelivery,
    activeOperationKey: _activeOperationKey,
    internalNote: _internalNote,
    reviewedById: _reviewedById,
    reviewedByName: _reviewedByName,
    ...rest
  } = request;
  void _internalNote;
  void _reviewedById;
  void _reviewedByName;
  void _activeOperationKey;
  void _discordDmOutbox;
  void _discordDmDelivery;
  const playerQuote = quote
    ? serializeEquipmentWorkshopQuote(quote, false)
    : undefined;
  return {
    ...rest,
    computedStatus: getEquipmentWorkshopComputedStatus(request.status, readyAt),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    ...(reviewedAt ? { reviewedAt: reviewedAt.toISOString() } : {}),
    ...(history
      ? {
          history: history.map((entry) => ({
            status: entry.status,
            at: entry.at.toISOString(),
            ...(entry.note ? { note: entry.note } : {}),
            ...(entry.quoteVersion !== undefined
              ? { quoteVersion: entry.quoteVersion }
              : {}),
          })),
        }
      : {}),
    ...(playerQuote ? { quote: playerQuote } : {}),
    ...(startedAt ? { startedAt: startedAt.toISOString() } : {}),
    ...(readyAt ? { readyAt: readyAt.toISOString() } : {}),
    ...(claimedAt ? { claimedAt: claimedAt.toISOString() } : {}),
    ...(approvalResolvedAt
      ? { approvalResolvedAt: approvalResolvedAt.toISOString() }
      : {}),
    ...(reloadedAt ? { reloadedAt: reloadedAt.toISOString() } : {}),
  };
}

export function serializeAdminEquipmentWorkshopRequest(
  request: EquipmentWorkshopRequestDoc,
): AdminSerializedEquipmentWorkshopRequest {
  return {
    ...serializeEquipmentWorkshopRequest(request),
    ...(request.reviewedById ? { reviewedById: request.reviewedById } : {}),
    ...(request.reviewedByName ? { reviewedByName: request.reviewedByName } : {}),
    ...(request.quote
      ? { quote: serializeEquipmentWorkshopQuote(request.quote, true) }
      : {}),
    ...(request.history
      ? {
          history: request.history.map((entry) => ({
            ...entry,
            at: entry.at.toISOString(),
          })),
        }
      : {}),
    ...(request.internalNote ? { internalNote: request.internalNote } : {}),
  };
}

export async function insertEquipmentWorkshopRequest(
  request: EquipmentWorkshopRequestDoc,
  options: { session?: ClientSession } = {},
): Promise<void> {
  await (await equipmentWorkshopRequestsCol()).insertOne(request, {
    session: options.session,
  });
}

export async function findEquipmentWorkshopRequestById(
  requestId: string,
  options: { session?: ClientSession } = {},
): Promise<EquipmentWorkshopRequestDoc | null> {
  return (await equipmentWorkshopRequestsCol()).findOne(
    { _id: requestId },
    { session: options.session },
  );
}

export async function findEquipmentWorkshopRequestByActiveOperationKey(
  activeOperationKey: string,
): Promise<EquipmentWorkshopRequestDoc | null> {
  return (await equipmentWorkshopRequestsCol()).findOne({ activeOperationKey });
}

export async function listEquipmentWorkshopRequests(options: {
  userId?: string;
  limit?: number;
} = {}): Promise<EquipmentWorkshopRequestDoc[]> {
  return (await equipmentWorkshopRequestsCol())
    .find(options.userId ? { userId: options.userId } : {})
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(options.limit ?? 30, 1), 100))
    .toArray();
}

export async function listActiveEquipmentWorkshopRequests(
  options: {
    userId?: string;
    limit?: number;
  } = {},
): Promise<EquipmentWorkshopRequestDoc[]> {
  const cursor = (await equipmentWorkshopRequestsCol())
    .find({
      ...(options.userId ? { userId: options.userId } : {}),
      status: { $in: [...EQUIPMENT_WORKSHOP_ACTIVE_STATUSES] },
    })
    .sort({ createdAt: 1 });

  if (options.limit !== undefined) {
    cursor.limit(Math.min(Math.max(options.limit, 1), 200));
  }

  return cursor.toArray();
}

export async function listTerminalEquipmentWorkshopRequests(
  options: {
    limit?: number;
  } = {},
): Promise<EquipmentWorkshopRequestDoc[]> {
  return (await equipmentWorkshopRequestsCol())
    .find({
      status: { $in: [...EQUIPMENT_WORKSHOP_TERMINAL_STATUSES] },
    })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 100))
    .toArray();
}

export async function listEquipmentWorkshopOperationsRequests(
  options: {
    recentLimit?: number;
  } = {},
): Promise<EquipmentWorkshopRequestDoc[]> {
  const [activeRequests, recentRequests] = await Promise.all([
    listActiveEquipmentWorkshopRequests(),
    listTerminalEquipmentWorkshopRequests({
      limit: options.recentLimit ?? 100,
    }),
  ]);

  return mergeEquipmentWorkshopRequestLists(activeRequests, recentRequests);
}

export async function claimDueEquipmentWorkshopDiscordDmDelivery(input: {
  requestId?: string;
  leaseToken: string;
  now: Date;
  leaseUntil: Date;
}): Promise<EquipmentWorkshopRequestDoc | null> {
  return (await equipmentWorkshopRequestsCol()).findOneAndUpdate(
    {
      ...(input.requestId ? { _id: input.requestId } : {}),
      discordDmOutbox: {
        $elemMatch: {
          availableAt: { $lte: input.now },
          sentAt: { $exists: false },
          skippedAt: { $exists: false },
        },
      },
      $or: [
        { "discordDmDelivery.leaseUntil": { $exists: false } },
        { "discordDmDelivery.leaseUntil": { $lte: input.now } },
      ],
      $and: [
        {
          $or: [
            { "discordDmDelivery.nextAttemptAt": { $exists: false } },
            { "discordDmDelivery.nextAttemptAt": { $lte: input.now } },
          ],
        },
      ],
    },
    {
      $set: {
        "discordDmDelivery.leaseToken": input.leaseToken,
        "discordDmDelivery.leaseUntil": input.leaseUntil,
      },
    },
    {
      sort: { updatedAt: 1 },
      returnDocument: "after",
    },
  );
}

export async function completeEquipmentWorkshopDiscordDmEvent(input: {
  requestId: string;
  leaseToken: string;
  eventId: string;
  completedAt: Date;
  result:
    | "sent"
    | "skipped_unlinked"
    | "skipped_inactive"
    | "skipped_unreachable"
    | "no_longer_ready";
}): Promise<boolean> {
  const completion =
    input.result === "sent"
      ? { "discordDmOutbox.$[event].sentAt": input.completedAt }
      : {
          "discordDmOutbox.$[event].skippedAt": input.completedAt,
          "discordDmOutbox.$[event].skippedReason": input.result,
        };
  const result = await (await equipmentWorkshopRequestsCol()).updateOne(
    {
      _id: input.requestId,
      "discordDmDelivery.leaseToken": input.leaseToken,
    },
    {
      $set: completion,
    },
    {
      arrayFilters: [
        {
          "event.id": input.eventId,
          "event.sentAt": { $exists: false },
          "event.skippedAt": { $exists: false },
        },
      ],
    },
  );
  return result.modifiedCount === 1;
}

export async function releaseEquipmentWorkshopDiscordDmDelivery(input: {
  requestId: string;
  leaseToken: string;
  failedAt?: Date;
  nextAttemptAt?: Date;
  error?: string;
}): Promise<boolean> {
  const result = await (await equipmentWorkshopRequestsCol()).updateOne(
    {
      _id: input.requestId,
      "discordDmDelivery.leaseToken": input.leaseToken,
    },
    {
      ...(input.failedAt && input.nextAttemptAt && input.error
        ? {
            $set: {
              "discordDmDelivery.failedAt": input.failedAt,
              "discordDmDelivery.nextAttemptAt": input.nextAttemptAt,
              "discordDmDelivery.lastError": input.error.slice(0, 300),
            },
          }
        : {}),
      $unset: {
        "discordDmDelivery.leaseToken": "",
        "discordDmDelivery.leaseUntil": "",
        ...(!input.failedAt
          ? {
              "discordDmDelivery.nextAttemptAt": "",
              "discordDmDelivery.failedAt": "",
              "discordDmDelivery.lastError": "",
            }
          : {}),
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function updateEquipmentWorkshopRequestStatus(input: {
  requestId: string;
  currentStatus: EquipmentWorkshopRequestStatus;
  status: EquipmentWorkshopRequestStatus;
  operatorNote?: string;
  reviewedById: string;
  reviewedByName: string;
}): Promise<EquipmentWorkshopRequestDoc | null> {
  const now = new Date();
  const closesOperation = ["DECLINED", "REJECTED", "CANCELLED", "COMPLETED"].includes(
    input.status,
  );
  return (await equipmentWorkshopRequestsCol()).findOneAndUpdate(
    { _id: input.requestId, status: input.currentStatus },
    {
      $set: {
        status: input.status,
        updatedAt: now,
        reviewedAt: now,
        reviewedById: input.reviewedById,
        reviewedByName: input.reviewedByName,
        ...(input.operatorNote !== undefined
          ? { operatorNote: input.operatorNote }
          : {}),
      },
      $push: {
        history: {
          status: input.status,
          at: now,
          actorId: input.reviewedById,
          actorName: input.reviewedByName,
          ...(input.operatorNote ? { note: input.operatorNote } : {}),
        },
        discordDmOutbox: {
          $each: createEquipmentWorkshopStatusDmOutboxEvents({
            status: input.status,
            at: now,
            ...(input.operatorNote ? { note: input.operatorNote } : {}),
          }),
        },
      },
      ...(closesOperation ? { $unset: { activeOperationKey: "" } } : {}),
    },
    { returnDocument: "after" },
  );
}

export async function updateEquipmentWorkshopQuote(input: {
  requestId: string;
  currentStatus: EquipmentWorkshopRequestStatus;
  expectedVersion: number;
  quote: NonNullable<EquipmentWorkshopRequestDoc["quote"]>;
  internalNote?: string;
  sourceSnapshot?: Pick<
    EquipmentWorkshopRequestDoc,
    | "sourceItemId"
    | "sourceCategory"
    | "sourceSlot"
    | "sourceDamage"
    | "sourcePreviewImage"
  >;
  actorId: string;
  actorName: string;
}): Promise<EquipmentWorkshopRequestDoc | null> {
  const now = new Date();
  return (await equipmentWorkshopRequestsCol()).findOneAndUpdate(
    {
      _id: input.requestId,
      status: input.currentStatus,
      $or: [
        { "quote.version": input.expectedVersion },
        ...(input.expectedVersion === 0 ? [{ quote: { $exists: false } }] : []),
      ],
    },
    {
      $set: {
        status: "QUOTED",
        quote: input.quote,
        updatedAt: now,
        reviewedAt: now,
        reviewedById: input.actorId,
        reviewedByName: input.actorName,
        ...(input.sourceSnapshot ?? {}),
        ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
      },
      $push: {
        history: {
          status: "QUOTED",
          at: now,
          actorId: input.actorId,
          actorName: input.actorName,
          quoteVersion: input.quote.version,
        },
        discordDmOutbox: createEquipmentWorkshopDiscordDmOutboxEvent({
          event: "QUOTED",
          createdAt: now,
          payload: {
            equipmentName: input.quote.result.name,
            quoteVersion: input.quote.version,
            totalCost: input.quote.totalCost,
            durationMinutes: input.quote.durationMinutes,
            ...(input.quote.specialistWorkflow
              ? { specialistWorkflow: input.quote.specialistWorkflow }
              : {}),
          },
        }),
      },
    },
    { returnDocument: "after" },
  );
}

export async function transitionEquipmentWorkshopRequest(input: {
  requestId: string;
  currentStatus: EquipmentWorkshopRequestStatus;
  status: EquipmentWorkshopRequestStatus;
  actorId: string;
  actorName: string;
  note?: string;
  set?: Record<string, unknown>;
  expectedQuoteVersion?: number;
  unset?: Record<string, "">;
  session?: ClientSession;
}): Promise<EquipmentWorkshopRequestDoc | null> {
  const now = new Date();
  const closesOperation = ["DECLINED", "REJECTED", "CANCELLED", "COMPLETED"].includes(
    input.status,
  );
  const waitsForInFlightReadyDm =
    input.currentStatus === "IN_PROGRESS" && closesOperation;
  const unset = {
    ...(input.unset ?? {}),
    ...(closesOperation ? { activeOperationKey: "" as const } : {}),
  };
  return (await equipmentWorkshopRequestsCol()).findOneAndUpdate(
    {
      _id: input.requestId,
      status: input.currentStatus,
      ...(input.expectedQuoteVersion !== undefined
        ? { "quote.version": input.expectedQuoteVersion }
        : {}),
      ...(waitsForInFlightReadyDm
        ? {
            $or: [
              { "discordDmDelivery.leaseUntil": { $exists: false } },
              { "discordDmDelivery.leaseUntil": { $lte: now } },
            ],
          }
        : {}),
    },
    {
      $set: {
        status: input.status,
        updatedAt: now,
        ...(input.note !== undefined ? { operatorNote: input.note } : {}),
        ...(input.set ?? {}),
      },
      $push: {
        history: {
          status: input.status,
          at: now,
          actorId: input.actorId,
          actorName: input.actorName,
          ...(input.note ? { note: input.note } : {}),
        },
        discordDmOutbox: {
          $each: createEquipmentWorkshopStatusDmOutboxEvents({
            status: input.status,
            at: now,
            ...(input.expectedQuoteVersion !== undefined
              ? { quoteVersion: input.expectedQuoteVersion }
              : {}),
            ...(input.set?.readyAt instanceof Date
              ? { readyAt: input.set.readyAt }
              : {}),
            ...(input.note ? { note: input.note } : {}),
          }),
        },
      },
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
    { returnDocument: "after", session: input.session },
  );
}
