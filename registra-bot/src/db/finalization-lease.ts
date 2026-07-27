/**
 * Registra 전용 세션 후속 처리 lease.
 *
 * shared-db의 공용 Session 계약을 확장하지 않고, sessions 문서에 Registra가
 * 소유하는 임시 필드를 저장해 CLOSING/CANCELING 후속 처리의 단일 실행자를
 * 보장합니다. 완료 시 모든 lease 필드는 함께 제거됩니다.
 */

import { createHash, randomUUID } from "node:crypto";
import { ObjectId, type Collection, type Document } from "mongodb";
import { sessionLogsCollection, sessionsCollection } from "./index.js";
import type { Session } from "../types/session.js";

export type PendingFinalizationStatus = "CLOSING" | "CANCELING";
export type FinalizationKind = "CLOSE" | "CANCEL";
export type FinalizationLogType = "CLOSED" | "FORCE_CLOSED" | "CANCELED";
export type FinalizationDeliveryDisposition = "SEND" | "SKIP" | "RECONCILE";

export type FinalizationLeaseClaim = {
  token: string;
  session: Session;
};

/** PNG 렌더링과 Discord 재시도 시간을 포함하는 단일 후속 처리 lease. */
export const FINALIZATION_LEASE_MS = 10 * 60 * 1000;

export function buildFinalizationMessageNonce(
  sessionId: string,
  kind: FinalizationKind,
  requestedAt?: Date
): string {
  return createHash("sha256")
    .update(
      [
        "registra-finalization",
        sessionId,
        kind,
        requestedAt?.toISOString() ?? "legacy",
      ].join(":")
    )
    .digest("hex")
    .slice(0, 25);
}

export function buildFinalizationLogId(operationKey: string): ObjectId {
  return new ObjectId(
    createHash("sha256")
      .update(`registra-finalization-log:${operationKey}`)
      .digest()
      .subarray(0, 12)
  );
}

export function getFinalizationDeliveryDisposition(
  deliveryState: Session["finalizationDeliveryState"],
  resultMessageId?: string
): FinalizationDeliveryDisposition {
  if (resultMessageId?.trim()) return "SKIP";
  if (deliveryState === undefined) return "RECONCILE";
  if (
    deliveryState === "DISPATCHING" ||
    deliveryState === "SENT" ||
    deliveryState === "DELIVERY_UNKNOWN"
  ) {
    return "RECONCILE";
  }
  return "SEND";
}

export function requiresLegacyFinalizationReconciliation(
  session: Session,
  kind: FinalizationKind
): boolean {
  if (
    !session.finalizationOperationKey?.trim() ||
    !(session.finalizationRequestedAt instanceof Date) ||
    session.finalizationDeliveryState === undefined
  ) {
    return true;
  }
  if (kind === "CANCEL") {
    return (
      session.finalizationTrigger !== "cancel" ||
      session.finalizationCancelReason === undefined
    );
  }
  return (
    session.finalizationTrigger !== "scheduled" &&
    session.finalizationTrigger !== "force"
  );
}

function sessions(): Collection<Document> {
  return sessionsCollection() as unknown as Collection<Document>;
}

function sessionLogs(): Collection<Document> {
  return sessionLogsCollection() as unknown as Collection<Document>;
}

function sessionIdFilter(sessionId: string): { _id: ObjectId } | null {
  if (!ObjectId.isValid(sessionId)) return null;
  return { _id: new ObjectId(sessionId) };
}

function leaseUntil(durationMs = FINALIZATION_LEASE_MS): Date {
  return new Date(Date.now() + durationMs);
}

export async function claimSessionFinalizationLease(
  sessionId: string,
  status: PendingFinalizationStatus,
  kind: FinalizationKind
): Promise<FinalizationLeaseClaim | null> {
  const idFilter = sessionIdFilter(sessionId);
  if (!idFilter) return null;

  const now = new Date();
  const token = randomUUID();
  const doc = await sessions().findOneAndUpdate(
    {
      ...idFilter,
      status,
      finalizationPending: true,
      finalizationKind: kind,
      finalizationDeliveryState: { $ne: "DELIVERY_UNKNOWN" },
      $or: [
        { finalizationClaimToken: { $exists: false } },
        { finalizationClaimToken: "" },
        { finalizationClaimLeaseUntil: { $exists: false } },
        { finalizationClaimLeaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        finalizationClaimToken: token,
        finalizationClaimedAt: now,
        finalizationClaimLeaseUntil: leaseUntil(),
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );

  if (!doc) return null;
  if (requiresLegacyFinalizationReconciliation(doc as unknown as Session, kind)) {
    await sessions().updateOne(
      {
        ...idFilter,
        status,
        finalizationPending: true,
        finalizationClaimToken: token,
      },
      {
        $set: {
          finalizationDeliveryState: "DELIVERY_UNKNOWN",
          finalizationDeliveryUnknownAt: now,
          finalizationReconciliationReason: "LEGACY_STATE_UNKNOWN",
          updatedAt: now,
        },
      }
    );
    return null;
  }
  return {
    token,
    session: doc as unknown as Session,
  };
}

export async function extendSessionFinalizationLease(
  sessionId: string,
  status: PendingFinalizationStatus,
  token: string,
  durationMs = FINALIZATION_LEASE_MS
): Promise<boolean> {
  const idFilter = sessionIdFilter(sessionId);
  if (!idFilter) return false;

  const result = await sessions().updateOne(
    {
      ...idFilter,
      status,
      finalizationPending: true,
      finalizationClaimToken: token,
    },
    {
      $set: {
        finalizationClaimLeaseUntil: leaseUntil(durationMs),
        updatedAt: new Date(),
      },
    }
  );
  return result.matchedCount > 0;
}

export async function releaseSessionFinalizationLease(
  sessionId: string,
  token: string
): Promise<boolean> {
  const idFilter = sessionIdFilter(sessionId);
  if (!idFilter) return false;

  const result = await sessions().updateOne(
    {
      ...idFilter,
      finalizationClaimToken: token,
    },
    {
      $set: { updatedAt: new Date() },
      $unset: {
        finalizationClaimToken: "",
        finalizationClaimedAt: "",
        finalizationClaimLeaseUntil: "",
      },
    }
  );
  return result.matchedCount > 0;
}

export async function markFinalizationAnnouncementDone(
  sessionId: string,
  status: PendingFinalizationStatus,
  token: string
): Promise<boolean> {
  const idFilter = sessionIdFilter(sessionId);
  if (!idFilter) return false;

  const result = await sessions().updateOne(
    {
      ...idFilter,
      status,
      finalizationPending: true,
      finalizationClaimToken: token,
    },
    {
      $set: {
        finalizationAnnouncementDone: true,
        updatedAt: new Date(),
      },
    }
  );
  return result.matchedCount > 0;
}

export async function markFinalizationDeliveryDispatching(
  sessionId: string,
  status: PendingFinalizationStatus,
  token: string
): Promise<boolean> {
  const idFilter = sessionIdFilter(sessionId);
  if (!idFilter) return false;

  const result = await sessions().updateOne(
    {
      ...idFilter,
      status,
      finalizationPending: true,
      finalizationClaimToken: token,
      finalizationDeliveryState: "PENDING",
    },
    {
      $set: {
        finalizationDeliveryState: "DISPATCHING",
        updatedAt: new Date(),
      },
    }
  );
  return result.matchedCount > 0;
}

export async function recordFinalizationResultMessage(
  sessionId: string,
  status: PendingFinalizationStatus,
  token: string,
  messageId: string
): Promise<boolean> {
  const idFilter = sessionIdFilter(sessionId);
  if (!idFilter) return false;

  const result = await sessions().updateOne(
    {
      ...idFilter,
      status,
      finalizationPending: true,
      finalizationClaimToken: token,
      finalizationDeliveryState: "DISPATCHING",
      $or: [
        { finalizationResultMessageId: { $exists: false } },
        { finalizationResultMessageId: "" },
        { finalizationResultMessageId: messageId },
      ],
    },
    {
      $set: {
        finalizationResultMessageId: messageId,
        finalizationDeliveryState: "SENT",
        updatedAt: new Date(),
      },
    }
  );
  return result.matchedCount > 0;
}

export async function markFinalizationDeliveryUnknown(
  sessionId: string,
  status: PendingFinalizationStatus,
  token: string,
  observedMessageId?: string
): Promise<boolean> {
  const idFilter = sessionIdFilter(sessionId);
  if (!idFilter) return false;

  const now = new Date();
  const $set: Record<string, unknown> = {
    finalizationDeliveryState: "DELIVERY_UNKNOWN",
    finalizationDeliveryUnknownAt: now,
    finalizationReconciliationReason: "DELIVERY_RESULT_UNKNOWN",
    updatedAt: now,
  };
  if (observedMessageId?.trim()) {
    $set.finalizationDeliveryObservedMessageId = observedMessageId;
  }

  const result = await sessions().updateOne(
    {
      ...idFilter,
      status,
      finalizationPending: true,
      finalizationClaimToken: token,
      finalizationDeliveryState: "DISPATCHING",
    },
    { $set }
  );
  return result.matchedCount > 0;
}

export async function appendFinalizationLogOnce(
  sessionId: string,
  operationKey: string,
  type: FinalizationLogType,
  options?: { userId?: string; payload?: Record<string, unknown> }
): Promise<void> {
  if (!operationKey.trim()) {
    throw new Error("Finalization operationKey must not be empty");
  }

  await sessionLogs().updateOne(
    { _id: buildFinalizationLogId(operationKey) },
    {
      $setOnInsert: {
        sessionId,
        type,
        operationKey,
        userId: options?.userId,
        payload: options?.payload,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function markFinalizationLogDone(
  sessionId: string,
  status: PendingFinalizationStatus,
  token: string,
  operationKey: string
): Promise<boolean> {
  const idFilter = sessionIdFilter(sessionId);
  if (!idFilter) return false;

  const result = await sessions().updateOne(
    {
      ...idFilter,
      status,
      finalizationPending: true,
      finalizationClaimToken: token,
      finalizationOperationKey: operationKey,
    },
    {
      $set: {
        finalizationLogDone: true,
        updatedAt: new Date(),
      },
    }
  );
  return result.matchedCount > 0;
}

export async function completeFinalizationWithLease(
  sessionId: string,
  currentStatus: PendingFinalizationStatus,
  finalStatus: "CLOSED" | "CANCELED",
  token: string
): Promise<boolean> {
  const idFilter = sessionIdFilter(sessionId);
  if (!idFilter) return false;

  const result = await sessions().updateOne(
    {
      ...idFilter,
      status: currentStatus,
      finalizationPending: true,
      finalizationClaimToken: token,
      finalizationAnnouncementDone: true,
      finalizationDeliveryState: "SENT",
      finalizationResultMessageId: { $exists: true, $ne: "" },
      finalizationLogDone: true,
    },
    {
      $set: {
        status: finalStatus,
        updatedAt: new Date(),
        finalizationPending: false,
      },
      $unset: {
        finalizationKind: "",
        finalizationTrigger: "",
        finalizationCancelReason: "",
        finalizationOperationKey: "",
        finalizationAnnouncementDone: "",
        finalizationResultMessageId: "",
        finalizationDeliveryState: "",
        finalizationDeliveryObservedMessageId: "",
        finalizationDeliveryUnknownAt: "",
        finalizationReconciliationReason: "",
        finalizationLogDone: "",
        finalizationRequestedBy: "",
        finalizationRequestedAt: "",
        finalizationClaimToken: "",
        finalizationClaimedAt: "",
        finalizationClaimLeaseUntil: "",
      },
    }
  );
  return result.modifiedCount > 0;
}
