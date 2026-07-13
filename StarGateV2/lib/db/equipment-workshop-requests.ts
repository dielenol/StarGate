import "server-only";
import "./init";

import { getDb } from "@stargate/shared-db";
import type { ClientSession } from "mongodb";
import type { EquipmentSlot, ItemCategory } from "@stargate/shared-db/types";

import type {
  EquipmentWorkshopRequestStatus,
  EquipmentWorkshopEscrow,
  EquipmentWorkshopQuote,
  SerializedEquipmentWorkshopRequest,
  AdminSerializedEquipmentWorkshopRequest,
} from "@/lib/equipment-shop/workshop-request";
import { getEquipmentWorkshopComputedStatus } from "@/lib/equipment-shop/workshop-request";

export interface EquipmentWorkshopRequestDoc {
  _id: string;
  kind: "upgrade" | "custom";
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
  startedAt?: Date;
  readyAt?: Date;
  claimedAt?: Date;
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
    internalNote: _internalNote,
    reviewedById: _reviewedById,
    reviewedByName: _reviewedByName,
    ...rest
  } = request;
  void _internalNote;
  void _reviewedById;
  void _reviewedByName;
  const playerQuote = quote
    ? (() => {
        const {
          issuedById: _issuedById,
          issuedByName: _issuedByName,
          ...publicQuote
        } = quote;
        void _issuedById;
        void _issuedByName;
        return { ...publicQuote, issuedAt: quote.issuedAt.toISOString() };
      })()
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
      ? { quote: { ...request.quote, issuedAt: request.quote.issuedAt.toISOString() } }
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
): Promise<void> {
  await (await equipmentWorkshopRequestsCol()).insertOne(request);
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
  limit = 100,
): Promise<EquipmentWorkshopRequestDoc[]> {
  return (await equipmentWorkshopRequestsCol())
    .find({ status: { $in: ["REQUESTED", "IN_REVIEW", "APPROVED", "QUOTED", "IN_PROGRESS"] } })
    .sort({ createdAt: 1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .toArray();
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
      },
    },
    { returnDocument: "after" },
  );
}

export async function updateEquipmentWorkshopQuote(input: {
  requestId: string;
  currentStatus: EquipmentWorkshopRequestStatus;
  expectedVersion: number;
  quote: EquipmentWorkshopRequestDoc["quote"];
  internalNote?: string;
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
        ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
      },
      $push: {
        history: {
          status: "QUOTED",
          at: now,
          actorId: input.actorId,
          actorName: input.actorName,
          quoteVersion: input.quote?.version,
        },
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
  session?: ClientSession;
}): Promise<EquipmentWorkshopRequestDoc | null> {
  const now = new Date();
  return (await equipmentWorkshopRequestsCol()).findOneAndUpdate(
    {
      _id: input.requestId,
      status: input.currentStatus,
      ...(input.expectedQuoteVersion !== undefined
        ? { "quote.version": input.expectedQuoteVersion }
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
      },
    },
    { returnDocument: "after", session: input.session },
  );
}
