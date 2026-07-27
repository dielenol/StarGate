import { getDb } from "@stargate/shared-db";
import type { Document, Filter } from "mongodb";

import type { DueWorkConsumerPort } from "./port.js";

interface ShadowDocument extends Document {
  _id: string;
}

class ShadowBoundaryConsumer implements DueWorkConsumerPort {
  constructor(
    readonly name: string,
    private readonly collectionName: string,
    private readonly filter: (now: Date) => Filter<ShadowDocument>,
  ) {}

  async tick(): Promise<{ observedDue: number }> {
    const db = await getDb();
    const observedDue = await db
      .collection<ShadowDocument>(this.collectionName)
      .countDocuments(this.filter(new Date()));
    return { observedDue };
  }
}

export function createShadowDomainConsumers(): DueWorkConsumerPort[] {
  return [
    new ShadowBoundaryConsumer(
      "ameri-dm",
      "equipment_workshop_requests",
      (now) => ({
        discordDmOutbox: {
          $elemMatch: {
            availableAt: { $lte: now },
            sentAt: { $exists: false },
            skippedAt: { $exists: false },
          },
        },
        $or: [
          { "discordDmDelivery.leaseUntil": { $exists: false } },
          { "discordDmDelivery.leaseUntil": { $lte: now } },
        ],
        $and: [
          {
            $or: [
              {
                "discordDmDelivery.nextAttemptAt": {
                  $exists: false,
                },
              },
              { "discordDmDelivery.nextAttemptAt": { $lte: now } },
            ],
          },
        ],
      }),
    ),
    new ShadowBoundaryConsumer(
      "research-card",
      "research_discord_cards",
      (now) => ({
        $expr: { $gt: ["$requestedRevision", "$syncedRevision"] },
        $and: [
          {
            $or: [
              { leaseExpiresAt: { $exists: false } },
              { leaseExpiresAt: { $lte: now } },
            ],
          },
          {
            $or: [
              { nextAttemptAt: { $exists: false } },
              { nextAttemptAt: { $lte: now } },
            ],
          },
        ],
      }),
    ),
    new ShadowBoundaryConsumer(
      "shop-restock",
      "shop_restock_notifications",
      (now) => ({
        _id: "daily-shop-restock",
        $expr: { $gt: ["$requestedRevision", "$syncedRevision"] },
        $and: [
          {
            $or: [
              { leaseExpiresAt: { $exists: false } },
              { leaseExpiresAt: { $lte: now } },
            ],
          },
          {
            $or: [
              { nextAttemptAt: { $exists: false } },
              { nextAttemptAt: { $lte: now } },
            ],
          },
        ],
      }),
    ),
    new ShadowBoundaryConsumer(
      "stock-market-wire",
      "stock_discord_market_wires",
      (now) => ({
        _id: "scheduled",
        $expr: { $gt: ["$requestedRevision", "$syncedRevision"] },
        $and: [
          {
            $or: [
              { leaseExpiresAt: { $exists: false } },
              { leaseExpiresAt: { $lte: now } },
            ],
          },
          {
            $or: [
              { nextAttemptAt: { $exists: false } },
              { nextAttemptAt: { $lte: now } },
            ],
          },
        ],
      }),
    ),
  ];
}
