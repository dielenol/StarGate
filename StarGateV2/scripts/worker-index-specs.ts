import type { RequiredIndexSpec } from "./index-spec.ts";

export const WORKER_REQUIRED_INDEXES: readonly RequiredIndexSpec[] = [
  {
    collection: "credit_transactions",
    name: "credit_transactions_dailyAllowance_unique",
    key: { "metadata.dailyAllowanceDate": 1, characterId: 1 },
    unique: true,
    partialFilterExpression: { "metadata.dailyAllowance": true },
  },
  {
    collection: "shared_inventory",
    name: "shared_inventory_scope_itemId_unique",
    key: { scope: 1, itemId: 1 },
    unique: true,
  },
  {
    collection: "shop_daily_stock",
    name: "shop_daily_stock_itemId_unique",
    key: { itemId: 1 },
    unique: true,
  },
  {
    collection: "stock_prices",
    name: "stock_prices_ticker_unique",
    key: { ticker: 1 },
    unique: true,
  },
  {
    collection: "notifications",
    name: "notifications_dedupeKey_partial_unique",
    key: { dedupeKey: 1 },
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: "string" } },
  },
  {
    collection: "stock_price_history",
    name: "stock_price_history_operationKey_partial_unique",
    key: { operationKey: 1 },
    unique: true,
    partialFilterExpression: { operationKey: { $type: "string" } },
  },
  {
    collection: "stock_price_history",
    name: "stock_price_history_ttl",
    key: { createdAt: 1 },
    expireAfterSeconds: 30 * 24 * 60 * 60,
  },
  {
    collection: "scheduled_job_runs",
    name: "scheduled_job_runs_jobName_slotKey_unique",
    key: { jobName: 1, slotKey: 1 },
    unique: true,
  },
  {
    collection: "scheduled_job_runs",
    name: "scheduled_job_runs_status_availableAt_leaseUntil",
    key: { status: 1, availableAt: 1, leaseUntil: 1 },
  },
  {
    collection: "integration_outbox",
    name: "integration_outbox_dedupeKey_unique",
    key: { dedupeKey: 1 },
    unique: true,
  },
  {
    collection: "integration_outbox",
    name: "integration_outbox_status_availableAt_createdAt",
    key: { status: 1, availableAt: 1, createdAt: 1, _id: 1 },
  },
  {
    collection: "integration_outbox",
    name: "integration_outbox_kind_status_availableAt_createdAt",
    key: {
      kind: 1,
      status: 1,
      availableAt: 1,
      createdAt: 1,
      _id: 1,
    },
  },
  {
    collection: "integration_outbox",
    name: "integration_outbox_status_leaseUntil_createdAt",
    key: { status: 1, leaseUntil: 1, createdAt: 1, _id: 1 },
  },
  {
    collection: "integration_outbox",
    name: "integration_outbox_kind_status_leaseUntil_createdAt",
    key: {
      kind: 1,
      status: 1,
      leaseUntil: 1,
      createdAt: 1,
      _id: 1,
    },
  },
  {
    collection: "integration_outbox",
    name: "integration_outbox_status_kind_deliveredAt",
    key: { status: 1, kind: 1, deliveredAt: -1 },
  },
  {
    collection: "integration_outbox",
    name: "integration_outbox_partition_status_order",
    key: {
      partitionKey: 1,
      status: 1,
      partitionOrderAt: 1,
      createdAt: 1,
      _id: 1,
    },
  },
  {
    collection: "worker_checkpoints",
    name: "worker_checkpoints_name_unique",
    key: { name: 1 },
    unique: true,
  },
  {
    collection: "research_discord_cards",
    name: "research_discord_cards_due",
    key: { nextAttemptAt: 1, leaseExpiresAt: 1, updatedAt: 1 },
  },
  {
    collection: "equipment_workshop_requests",
    name: "equipment_workshop_requests_discord_dm_outbox",
    key: { "discordDmOutbox.availableAt": 1, updatedAt: 1 },
  },
  {
    collection: "sessions",
    name: "sessions_finalization_pending_claimLease",
    key: {
      finalizationPending: 1,
      status: 1,
      finalizationClaimLeaseUntil: 1,
      finalizationRequestedAt: 1,
    },
  },
];
