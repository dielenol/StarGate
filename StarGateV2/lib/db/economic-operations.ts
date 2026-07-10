import { createHash } from "node:crypto";

import type { ClientSession } from "mongodb";

import "./init";

import { getDb } from "@stargate/shared-db";

interface EconomicOperation {
  _id: string;
  requestId: string;
  domain: string;
  actorId: string;
  payloadHash: string;
  status: "processing" | "completed" | "failed";
  responseStatus?: number;
  responseBody?: unknown;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type EconomicOperationClaim =
  | { kind: "claimed" }
  | { kind: "completed"; status: number; body: unknown }
  | { kind: "processing" }
  | { kind: "failed"; status: number; body: unknown }
  | { kind: "conflict" };

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function payloadHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(payload)))
    .digest("hex");
}

function matchesOperation(
  operation: EconomicOperation,
  args: { domain: string; actorId: string; payload: unknown },
): boolean {
  return (
    operation.domain === args.domain &&
    operation.actorId === args.actorId &&
    operation.payloadHash === payloadHash(args.payload)
  );
}

async function operationsCol() {
  const db = await getDb();
  return db.collection<EconomicOperation>("economic_operations");
}

export async function findEconomicOperation(args: {
  requestId: string;
  domain: string;
  actorId: string;
  payload: unknown;
}): Promise<EconomicOperationClaim | null> {
  const col = await operationsCol();
  const existing = await col.findOne({ _id: args.requestId });
  if (!existing) return null;
  if (!matchesOperation(existing, args)) return { kind: "conflict" };
  if (existing.status === "processing") return { kind: "processing" };
  return {
    kind: existing.status,
    status: existing.responseStatus ?? 500,
    body: existing.responseBody ?? { error: "저장된 처리 결과가 없습니다." },
  };
}

export async function insertEconomicOperationClaim(
  args: {
    requestId: string;
    domain: string;
    actorId: string;
    payload: unknown;
  },
  session: ClientSession,
): Promise<void> {
  const col = await operationsCol();
  const now = new Date();
  await col.insertOne(
    {
      _id: args.requestId,
      requestId: args.requestId,
      domain: args.domain,
      actorId: args.actorId,
      payloadHash: payloadHash(args.payload),
      status: "processing",
      createdAt: now,
      updatedAt: now,
    },
    { session },
  );
}

export async function completeEconomicOperation(args: {
  requestId: string;
  status: number;
  body: unknown;
}, options: { session?: ClientSession } = {}): Promise<void> {
  const col = await operationsCol();
  await col.updateOne(
    { _id: args.requestId, status: "processing" },
    {
      $set: {
        status: "completed",
        responseStatus: args.status,
        responseBody: args.body,
        updatedAt: new Date(),
      },
    },
    { session: options.session },
  );
}
