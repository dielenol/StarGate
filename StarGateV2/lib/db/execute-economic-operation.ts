import { MongoServerError, type ClientSession } from "mongodb";
import { getClient } from "@stargate/shared-db";

import {
  completeEconomicOperation,
  findEconomicOperation,
  insertEconomicOperationClaim,
} from "./economic-operations";

export interface EconomicOperationResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export async function executeEconomicOperationResult<T>(args: {
  requestId: string;
  domain: string;
  actorId: string;
  payload: unknown;
  run: (session: ClientSession) => Promise<{ status: number; body: T }>;
}): Promise<EconomicOperationResult<T>> {
  const existing = await findEconomicOperation(args);
  if (existing) {
    if (existing.kind === "completed" || existing.kind === "failed") {
      return {
        status: existing.status,
        body: existing.body as T,
        replayed: true,
      };
    }
    if (existing.kind === "processing" || existing.kind === "conflict") {
      throw new EconomicOperationConflictError(existing.kind);
    }
    throw new Error("INVALID_ECONOMIC_OPERATION_STATE");
  }

  const client = await getClient();
  const session = client.startSession();
  let outcome: { status: number; body: T } | undefined;
  try {
    await session.withTransaction(async () => {
      await insertEconomicOperationClaim(args, session);
      outcome = await args.run(session);
      await completeEconomicOperation(
        {
          requestId: args.requestId,
          status: outcome.status,
          body: outcome.body,
        },
        { session },
      );
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const replay = await findEconomicOperation(args);
      if (replay?.kind === "completed" || replay?.kind === "failed") {
        return {
          status: replay.status,
          body: replay.body as T,
          replayed: true,
        };
      }
      if (replay?.kind === "processing" || replay?.kind === "conflict") {
        throw new EconomicOperationConflictError(replay.kind);
      }
      throw error;
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!outcome) throw new Error("ECONOMIC_OPERATION_NOT_COMMITTED");
  return { ...outcome, replayed: false };
}

export class EconomicOperationConflictError extends Error {
  readonly reason: "processing" | "conflict";

  constructor(reason: "processing" | "conflict") {
    super("DUPLICATE_REQUEST");
    this.name = "EconomicOperationConflictError";
    this.reason = reason;
  }
}
