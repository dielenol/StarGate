import "@/lib/db/init";

import { createHash } from "node:crypto";

import {
  enqueueIntegrationOutbox,
  type IntegrationOutboxKind,
} from "@stargate/shared-db";
import type { ClientSession } from "mongodb";

import type {
  CharacterEditWebhookPayload,
  EquipmentWorkshopRequestWebhookPayload,
  GmAdminAuditWebhookPayload,
  ShopReorderFulfilledWebhookPayload,
  ShopReorderWebhookPayload,
} from "@/lib/discord";
import type { PlayerTradeDiscordDmInput } from "@/lib/notifications/player-trade-discord-dm";
import type { StockManualInterventionNotice } from "@/lib/stocks/market-wire";

type TimestampedPayload =
  | CharacterEditWebhookPayload
  | EquipmentWorkshopRequestWebhookPayload
  | GmAdminAuditWebhookPayload;

function hashDedupePayload(
  kind: IntegrationOutboxKind,
  payload: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(`${kind}:${JSON.stringify(payload)}`)
    .digest("hex");
}

function withIsoTimestamp(
  payload: TimestampedPayload,
): Record<string, unknown> {
  return {
    ...payload,
    timestamp: payload.timestamp.toISOString(),
  };
}

async function enqueueDelivery(input: {
  kind: IntegrationOutboxKind;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}, options: { session?: ClientSession } = {}): Promise<void> {
  const digest =
    input.dedupeKey ?? hashDedupePayload(input.kind, input.payload);
  await enqueueIntegrationOutbox(
    {
      kind: input.kind,
      dedupeKey: `${input.kind.toLowerCase()}:${digest}`,
      version: 1,
      payload: input.payload,
    },
    options,
  );
}

export async function enqueueGmAdminAudit(
  payload: GmAdminAuditWebhookPayload,
  options: { session?: ClientSession; dedupeKey?: string } = {},
): Promise<void> {
  if (payload.actor.role !== "GM") return;
  const serialized = withIsoTimestamp(payload);
  await enqueueDelivery({
    kind: "GM_ADMIN_AUDIT",
    payload: serialized,
    dedupeKey: options.dedupeKey,
  }, options);
}

export async function enqueueCharacterEditWebhook(
  payload: CharacterEditWebhookPayload,
  dedupeKey?: string,
  options: { session?: ClientSession } = {},
): Promise<void> {
  const serialized = withIsoTimestamp(payload);
  await enqueueDelivery({
    kind: "CHARACTER_EDIT_WEBHOOK",
    payload: serialized,
    dedupeKey,
  }, options);
}

export async function enqueueEquipmentWorkshopWebhook(
  payload: EquipmentWorkshopRequestWebhookPayload,
  dedupeKey?: string,
  options: { session?: ClientSession } = {},
): Promise<void> {
  const serialized = withIsoTimestamp(payload);
  await enqueueDelivery({
    kind: "EQUIPMENT_WORKSHOP_WEBHOOK",
    payload: serialized,
    dedupeKey,
  }, options);
}

export async function enqueueShopReorderRequestWebhook(
  payload: ShopReorderWebhookPayload,
  dedupeKey?: string,
  options: { session?: ClientSession } = {},
): Promise<void> {
  await enqueueDelivery({
    kind: "SHOP_REORDER_REQUEST_WEBHOOK",
    payload: {
      ...payload,
      requestedAt: payload.requestedAt.toISOString(),
    },
    dedupeKey,
  }, options);
}

export async function enqueueShopReorderFulfilledWebhook(
  payload: ShopReorderFulfilledWebhookPayload,
  dedupeKey?: string,
  options: { session?: ClientSession } = {},
): Promise<void> {
  await enqueueDelivery({
    kind: "SHOP_REORDER_FULFILLED_WEBHOOK",
    payload: {
      ...payload,
      fulfilledAt: payload.fulfilledAt.toISOString(),
    },
    dedupeKey,
  }, options);
}

export async function enqueueStockManualInterventionWebhook(
  payload: StockManualInterventionNotice,
  dedupeKey?: string,
  options: { session?: ClientSession } = {},
): Promise<void> {
  await enqueueDelivery(
    {
      kind: "STOCK_MANUAL_INTERVENTION_WEBHOOK",
      payload: {
        ...payload,
        occurredAt: (payload.occurredAt ?? new Date()).toISOString(),
      },
      dedupeKey,
    },
    options,
  );
}

export async function enqueuePlayerTradeDiscordDm(
  payload: PlayerTradeDiscordDmInput,
): Promise<void> {
  await enqueueDelivery({
    kind: "PLAYER_TRADE_DM",
    dedupeKey: `${payload.tradeId}:${payload.event}:${payload.userId}`,
    payload: { ...payload },
  });
}
