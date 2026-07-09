import "../db/init";

import { getClient, getDb } from "@stargate/shared-db";

export { buildShopReorderRequestId } from "./reorder-request-id";

export type ShopReorderRequestStatus = "REQUESTED" | "FULFILLED";

export interface ShopReorderRequestDoc {
  _id: string;
  kind: "shop-reorder-request";
  date: string;
  slug: string;
  itemName: string;
  userId: string;
  userName: string;
  characterId?: string;
  characterCodename?: string;
  status: ShopReorderRequestStatus;
  createdAt: Date;
  fulfilledAt?: Date;
  fulfilledById?: string;
  fulfilledByName?: string;
  fulfilledQuantity?: number;
}

interface ShopDailyStockDoc {
  itemId: string;
  stock: number;
  lastRefresh: string;
}

export class ShopReorderRequestNotPendingError extends Error {
  constructor(requestId: string) {
    super(`Shop reorder request is not pending: ${requestId}`);
    this.name = "ShopReorderRequestNotPendingError";
  }
}

async function reorderRequestsCol() {
  const db = await getDb();
  return db.collection<ShopReorderRequestDoc>("shop_reorder_requests");
}

export async function insertShopReorderRequest(
  doc: ShopReorderRequestDoc,
): Promise<void> {
  await (await reorderRequestsCol()).insertOne(doc);
}

export async function listPendingShopReorderRequests(): Promise<
  ShopReorderRequestDoc[]
> {
  return (await reorderRequestsCol())
    .find({
      kind: "shop-reorder-request",
      status: "REQUESTED",
    })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function countPendingShopReorderRequests(): Promise<number> {
  return (await reorderRequestsCol()).countDocuments({
    kind: "shop-reorder-request",
    status: "REQUESTED",
  });
}

export async function findPendingShopReorderRequestForUserItem(input: {
  date: string;
  userId: string;
  slug: string;
}): Promise<ShopReorderRequestDoc | null> {
  return (await reorderRequestsCol()).findOne({
    kind: "shop-reorder-request",
    status: "REQUESTED",
    date: input.date,
    userId: input.userId,
    slug: input.slug,
  });
}

export async function countShopReorderRequestsForUserItem(input: {
  date: string;
  userId: string;
  slug: string;
}): Promise<number> {
  return (await reorderRequestsCol()).countDocuments({
    kind: "shop-reorder-request",
    date: input.date,
    userId: input.userId,
    slug: input.slug,
  });
}

export async function findShopReorderRequestById(
  requestId: string,
): Promise<ShopReorderRequestDoc | null> {
  return (await reorderRequestsCol()).findOne({
    _id: requestId,
    kind: "shop-reorder-request",
  });
}

export async function fulfillShopReorderRequestAndIncrementStock(input: {
  requestId: string;
  quantity: number;
  fulfilledById: string;
  fulfilledByName: string;
  fulfilledAt: Date;
  itemId: string;
  today: string;
}): Promise<{
  request: ShopReorderRequestDoc;
  stock: ShopDailyStockDoc;
}> {
  if (input.quantity <= 0) {
    throw new Error(`fulfillShopReorderRequest: quantity must be positive`);
  }

  const client = await getClient();
  const db = await getDb();
  const session = client.startSession();
  let fulfilledRequest: ShopReorderRequestDoc | null = null;
  let stockDoc: ShopDailyStockDoc | null = null;

  try {
    await session.withTransaction(async () => {
      fulfilledRequest = await db
        .collection<ShopReorderRequestDoc>("shop_reorder_requests")
        .findOneAndUpdate(
          {
            _id: input.requestId,
            kind: "shop-reorder-request",
            status: "REQUESTED",
          },
          {
            $set: {
              status: "FULFILLED",
              fulfilledAt: input.fulfilledAt,
              fulfilledById: input.fulfilledById,
              fulfilledByName: input.fulfilledByName,
              fulfilledQuantity: input.quantity,
            },
          },
          { returnDocument: "after", session },
        );

      if (!fulfilledRequest) {
        throw new ShopReorderRequestNotPendingError(input.requestId);
      }

      stockDoc = await db
        .collection<ShopDailyStockDoc>("shop_daily_stock")
        .findOneAndUpdate(
          { itemId: input.itemId },
          {
            $inc: { stock: input.quantity },
            $set: { lastRefresh: input.today },
            $setOnInsert: { itemId: input.itemId },
          },
          { upsert: true, returnDocument: "after", session },
        );

      if (!stockDoc) {
        throw new Error(`fulfillShopReorderRequest: stock update failed`);
      }
    });
  } finally {
    await session.endSession();
  }

  if (!fulfilledRequest || !stockDoc) {
    throw new Error(`fulfillShopReorderRequest: transaction failed`);
  }

  return { request: fulfilledRequest, stock: stockDoc };
}
