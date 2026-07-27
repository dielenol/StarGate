import type { ObjectId } from "mongodb";

export const SCHEDULED_JOB_RUN_STATUSES = [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "DEAD",
] as const;

export type ScheduledJobRunStatus =
  (typeof SCHEDULED_JOB_RUN_STATUSES)[number];

export interface ScheduledJobRun {
  _id?: ObjectId;
  jobName: string;
  slotKey: string;
  status: ScheduledJobRunStatus;
  attempts: number;
  availableAt: Date;
  leaseToken?: string;
  leaseUntil?: Date;
  summary?: Record<string, unknown>;
  lastError?: string;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export const INTEGRATION_OUTBOX_STATUSES = [
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "DEAD",
] as const;

export type IntegrationOutboxStatus =
  (typeof INTEGRATION_OUTBOX_STATUSES)[number];

export const INTEGRATION_OUTBOX_KINDS = [
  "GM_ADMIN_AUDIT",
  "CHARACTER_EDIT_WEBHOOK",
  "EQUIPMENT_WORKSHOP_WEBHOOK",
  "SHOP_REORDER_REQUEST_WEBHOOK",
  "SHOP_REORDER_FULFILLED_WEBHOOK",
  "STOCK_MANUAL_INTERVENTION_WEBHOOK",
  "PLAYER_TRADE_DM",
] as const;

export type IntegrationOutboxKind =
  (typeof INTEGRATION_OUTBOX_KINDS)[number];

export interface IntegrationOutboxEvent {
  _id?: ObjectId;
  kind: IntegrationOutboxKind;
  dedupeKey: string;
  version: number;
  payload: Record<string, unknown>;
  status: IntegrationOutboxStatus;
  attempts: number;
  availableAt: Date;
  leaseToken?: string;
  leaseUntil?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt?: Date;
  deadAt?: Date;
}

export interface WorkerCheckpoint {
  _id?: ObjectId;
  name: string;
  resumeToken: unknown;
  updatedAt: Date;
}
