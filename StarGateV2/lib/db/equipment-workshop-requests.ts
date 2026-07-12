import "server-only";
import "./init";

import { getDb } from "@stargate/shared-db";

import type {
  EquipmentWorkshopRequestStatus,
  SerializedEquipmentWorkshopRequest,
} from "@/lib/equipment-shop/workshop-request";

export interface EquipmentWorkshopRequestDoc {
  _id: string;
  kind: "upgrade" | "custom";
  userId: string;
  userName: string;
  characterId: string;
  characterCodename: string;
  inventoryEntryId?: string;
  equipmentName?: string;
  details: string;
  status: EquipmentWorkshopRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt?: Date;
  reviewedById?: string;
  reviewedByName?: string;
  operatorNote?: string;
  history?: EquipmentWorkshopRequestHistoryEntry[];
}

interface EquipmentWorkshopRequestHistoryEntry {
  status: EquipmentWorkshopRequestStatus;
  at: Date;
  actorId: string;
  actorName: string;
  note?: string;
}

async function workshopRequestsCol() {
  const db = await getDb();
  return db.collection<EquipmentWorkshopRequestDoc>(
    "equipment_workshop_requests",
  );
}

export function serializeEquipmentWorkshopRequest(
  request: EquipmentWorkshopRequestDoc,
): SerializedEquipmentWorkshopRequest {
  const { createdAt, updatedAt, reviewedAt, history, ...rest } = request;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    ...(reviewedAt ? { reviewedAt: reviewedAt.toISOString() } : {}),
    ...(history
      ? {
          history: history.map((entry) => ({
            ...entry,
            at: entry.at.toISOString(),
          })),
        }
      : {}),
  };
}

export async function insertEquipmentWorkshopRequest(
  request: EquipmentWorkshopRequestDoc,
): Promise<void> {
  await (await workshopRequestsCol()).insertOne(request);
}

export async function findEquipmentWorkshopRequestById(
  requestId: string,
): Promise<EquipmentWorkshopRequestDoc | null> {
  return (await workshopRequestsCol()).findOne({ _id: requestId });
}

export async function listEquipmentWorkshopRequests(options: {
  userId?: string;
  limit?: number;
} = {}): Promise<EquipmentWorkshopRequestDoc[]> {
  return (await workshopRequestsCol())
    .find(options.userId ? { userId: options.userId } : {})
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(options.limit ?? 30, 1), 100))
    .toArray();
}

export async function listActiveEquipmentWorkshopRequests(
  limit = 100,
): Promise<EquipmentWorkshopRequestDoc[]> {
  return (await workshopRequestsCol())
    .find({ status: { $in: ["REQUESTED", "IN_REVIEW", "APPROVED"] } })
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
  return (await workshopRequestsCol()).findOneAndUpdate(
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
