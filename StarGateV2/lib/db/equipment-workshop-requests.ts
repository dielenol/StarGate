import "server-only";
import "./init";

import { getDb } from "@stargate/shared-db";
import type { ClientSession } from "mongodb";
import type { EquipmentSlot, ItemCategory } from "@stargate/shared-db/types";

import type {
  EquipmentWorkshopRequestStatus,
  EquipmentWorkshopRequestKind,
  EquipmentWorkshopEscrow,
  EquipmentWorkshopQuote,
  EquipmentWorkshopReload,
  SerializedEquipmentWorkshopRequest,
  AdminSerializedEquipmentWorkshopRequest,
} from "@/lib/equipment-shop/workshop-request";
import {
  EQUIPMENT_WORKSHOP_ACTIVE_STATUSES,
  EQUIPMENT_WORKSHOP_TERMINAL_STATUSES,
  getEquipmentWorkshopComputedStatus,
  mergeEquipmentWorkshopRequestLists,
} from "@/lib/equipment-shop/workshop-request";
import {
  createEquipmentWorkshopDiscordDmOutboxEvent,
  createEquipmentWorkshopStatusDmOutboxEvents,
  type EquipmentWorkshopDiscordDmOutboxEvent,
} from "@/lib/equipment-shop/workshop-discord-dm-outbox";
import { enqueueWorkflowStatusWebhook } from "@/lib/outbox/integration";
import type { WorkflowStatusWebhookPayload } from "@/lib/outbox/contracts";

export interface EquipmentWorkshopRequestDoc {
  _id: string;
  kind: EquipmentWorkshopRequestKind;
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
  reload?: EquipmentWorkshopReload;
  /** 진행 중인 동일 장비 작업을 막는 내부 unique key. */
  activeOperationKey?: string;
  startedAt?: Date;
  readyAt?: Date;
  claimedAt?: Date;
  approvalVoteId?: string;
  approvalOutcome?: "APPROVED" | "REJECTED";
  approvalResolvedAt?: Date;
  reloadedAt?: Date;
  discordDmOutbox?: EquipmentWorkshopDiscordDmOutboxEvent[];
  discordDmDelivery?: {
    leaseToken?: string;
    leaseUntil?: Date;
    nextAttemptAt?: Date;
    failedAt?: Date;
    lastError?: string;
  };
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

type WorkshopWorkflowActorKind = WorkflowStatusWebhookPayload["actor"]["kind"];

const WORKSHOP_STAGE_SUMMARY: Record<
  EquipmentWorkshopRequestStatus,
  string
> = {
  REQUESTED: "공방 요청이 접수되었습니다.",
  IN_REVIEW: "운영자가 요청 검토를 시작했습니다.",
  APPROVED: "기존 승인 상태로 전환되었습니다.",
  QUOTED: "공방 견적이 발행되었습니다.",
  IN_PROGRESS: "견적이 수락되어 담당 공방 작업자에게 위임되었습니다.",
  DECLINED: "의뢰인이 견적을 거절했습니다.",
  REJECTED: "운영자가 공방 요청을 반려했습니다.",
  CANCELLED: "진행 중인 공방 작업이 취소되었습니다.",
  COMPLETED: "공방 작업이 완료되어 결과 처리가 끝났습니다.",
};

export async function enqueueEquipmentWorkshopWorkflowStages(input: {
  request: EquipmentWorkshopRequestDoc;
  stage: EquipmentWorkshopRequestStatus;
  actorName: string;
  actorKind: WorkshopWorkflowActorKind;
  occurredAt: Date;
  session?: ClientSession;
}): Promise<void> {
  // 최초 접수 이벤트는 이후 견적·표결 상태와 무관한 불변 v0 원장이다.
  // 응답 유실 뒤 POST가 재시도돼도 현재 request의 후속 상태를 섞지 않는다.
  const workflowQuote =
    input.stage === "REQUESTED" ? undefined : input.request.quote;
  const workflowApprovalVoteId =
    input.stage === "REQUESTED" ? undefined : input.request.approvalVoteId;
  const workflowOperatorNote =
    input.stage === "REQUESTED" ? undefined : input.request.operatorNote;
  const revision = workflowQuote?.version ?? 0;
  const delegatedTo = [
    ...(workflowQuote?.specialistWorkflow?.map(
      (step) => step.specialistCodename,
    ) ?? []),
    ...(workflowApprovalVoteId ? ["REGISTRAR"] : []),
  ];
  const target = [
    input.request.characterCodename,
    workflowQuote?.result.name ?? input.request.equipmentName,
  ].filter(Boolean).join(" · ");
  const details = [
    workflowQuote
      ? {
          name: "견적",
          value: `v${workflowQuote.version} · ${workflowQuote.totalCost.toLocaleString("ko-KR")} CR · ${workflowQuote.durationMinutes}분`,
        }
      : null,
    workflowOperatorNote
      ? { name: "메모", value: workflowOperatorNote }
      : null,
  ].filter((value): value is { name: string; value: string } => Boolean(value));
  const common = {
    workflow: "EQUIPMENT_WORKSHOP" as const,
    workflowId: input.request._id,
    revision,
    actor: {
      kind: input.actorKind,
      displayName: input.actorName,
    },
    target: target || undefined,
    ...(delegatedTo.length > 0 ? { delegatedTo } : {}),
    ...(details.length > 0 ? { details } : {}),
    urlPath: "/erp/admin/equipment-workshop",
  };
  await enqueueWorkflowStatusWebhook(
    {
      ...common,
      stage: input.stage,
      summary: WORKSHOP_STAGE_SUMMARY[input.stage],
      occurredAt: input.occurredAt,
    },
    `workflow:equipment-workshop:${input.request._id}:${input.stage}:${revision}`,
    { session: input.session },
  );

  if (input.stage === "IN_PROGRESS" && input.request.readyAt) {
    await enqueueWorkflowStatusWebhook(
      {
        ...common,
        stage: "READY",
        actor: { kind: "SYSTEM", displayName: "AMERI" },
        summary: "예정 작업 시간이 지나 결과 수령이 가능한지 확인할 단계입니다.",
        occurredAt: input.request.readyAt,
        availableAt: input.request.readyAt,
      },
      `workflow:equipment-workshop:${input.request._id}:READY:${revision}`,
      { session: input.session },
    );
  }

}

export async function equipmentWorkshopRequestsCol() {
  const db = await getDb();
  return db.collection<EquipmentWorkshopRequestDoc>(
    "equipment_workshop_requests",
  );
}

function serializeEquipmentWorkshopQuote(
  quote: NonNullable<EquipmentWorkshopRequestDoc["quote"]>,
  includeIssuer: boolean,
): EquipmentWorkshopQuote {
  const materials = quote.materials.map((material) => {
    const unitPrice = Number(material.unitPrice ?? 0);
    const subtotal = Number(
      (material.subtotal ?? unitPrice * material.quantity).toFixed(2),
    );
    return { ...material, unitPrice, subtotal };
  });
  const materialCost = Number(
    (quote.materialCost
      ?? materials.reduce((total, material) => total + material.subtotal, 0)
    ).toFixed(2),
  );
  const totalCost = Number(
    (quote.totalCost ?? materialCost + quote.creditCost).toFixed(2),
  );
  const serialized: EquipmentWorkshopQuote = {
    ...quote,
    modificationDomain: quote.modificationDomain ?? "GENERAL",
    materials,
    materialCost,
    totalCost,
    issuedAt: quote.issuedAt.toISOString(),
  };
  if (!includeIssuer) {
    delete serialized.issuedById;
    delete serialized.issuedByName;
  }
  return serialized;
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
    approvalResolvedAt,
    reloadedAt,
    discordDmOutbox: _discordDmOutbox,
    discordDmDelivery: _discordDmDelivery,
    activeOperationKey: _activeOperationKey,
    internalNote: _internalNote,
    reviewedById: _reviewedById,
    reviewedByName: _reviewedByName,
    ...rest
  } = request;
  void _internalNote;
  void _reviewedById;
  void _reviewedByName;
  void _activeOperationKey;
  void _discordDmOutbox;
  void _discordDmDelivery;
  const playerQuote = quote
    ? serializeEquipmentWorkshopQuote(quote, false)
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
    ...(approvalResolvedAt
      ? { approvalResolvedAt: approvalResolvedAt.toISOString() }
      : {}),
    ...(reloadedAt ? { reloadedAt: reloadedAt.toISOString() } : {}),
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
      ? { quote: serializeEquipmentWorkshopQuote(request.quote, true) }
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
  options: { session?: ClientSession } = {},
): Promise<void> {
  await (await equipmentWorkshopRequestsCol()).insertOne(request, {
    session: options.session,
  });
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

export async function findEquipmentWorkshopRequestByActiveOperationKey(
  activeOperationKey: string,
): Promise<EquipmentWorkshopRequestDoc | null> {
  return (await equipmentWorkshopRequestsCol()).findOne({ activeOperationKey });
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
  options: {
    userId?: string;
    limit?: number;
  } = {},
): Promise<EquipmentWorkshopRequestDoc[]> {
  const cursor = (await equipmentWorkshopRequestsCol())
    .find({
      ...(options.userId ? { userId: options.userId } : {}),
      status: { $in: [...EQUIPMENT_WORKSHOP_ACTIVE_STATUSES] },
    })
    .sort({ createdAt: 1 });

  if (options.limit !== undefined) {
    cursor.limit(Math.min(Math.max(options.limit, 1), 200));
  }

  return cursor.toArray();
}

export async function listTerminalEquipmentWorkshopRequests(
  options: {
    limit?: number;
  } = {},
): Promise<EquipmentWorkshopRequestDoc[]> {
  return (await equipmentWorkshopRequestsCol())
    .find({
      status: { $in: [...EQUIPMENT_WORKSHOP_TERMINAL_STATUSES] },
    })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 100))
    .toArray();
}

export async function listEquipmentWorkshopOperationsRequests(
  options: {
    recentLimit?: number;
  } = {},
): Promise<EquipmentWorkshopRequestDoc[]> {
  const [activeRequests, recentRequests] = await Promise.all([
    listActiveEquipmentWorkshopRequests(),
    listTerminalEquipmentWorkshopRequests({
      limit: options.recentLimit ?? 100,
    }),
  ]);

  return mergeEquipmentWorkshopRequestLists(activeRequests, recentRequests);
}

export async function updateEquipmentWorkshopRequestStatus(input: {
  requestId: string;
  currentStatus: EquipmentWorkshopRequestStatus;
  status: EquipmentWorkshopRequestStatus;
  operatorNote?: string;
  reviewedById: string;
  reviewedByName: string;
  actorKind?: WorkshopWorkflowActorKind;
  session?: ClientSession;
}): Promise<EquipmentWorkshopRequestDoc | null> {
  const now = new Date();
  const closesOperation = ["DECLINED", "REJECTED", "CANCELLED", "COMPLETED"].includes(
    input.status,
  );
  const updated = await (await equipmentWorkshopRequestsCol()).findOneAndUpdate(
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
        discordDmOutbox: {
          $each: createEquipmentWorkshopStatusDmOutboxEvents({
            status: input.status,
            at: now,
            ...(input.operatorNote ? { note: input.operatorNote } : {}),
          }),
        },
      },
      ...(closesOperation ? { $unset: { activeOperationKey: "" } } : {}),
    },
    { returnDocument: "after", session: input.session },
  );
  if (updated) {
    await enqueueEquipmentWorkshopWorkflowStages({
      request: updated,
      stage: input.status,
      actorName: input.reviewedByName,
      actorKind: input.actorKind ?? "GM",
      occurredAt: now,
      session: input.session,
    });
  }
  return updated;
}

export async function updateEquipmentWorkshopQuote(input: {
  requestId: string;
  currentStatus: EquipmentWorkshopRequestStatus;
  expectedVersion: number;
  quote: NonNullable<EquipmentWorkshopRequestDoc["quote"]>;
  internalNote?: string;
  sourceSnapshot?: Pick<
    EquipmentWorkshopRequestDoc,
    | "sourceItemId"
    | "sourceCategory"
    | "sourceSlot"
    | "sourceDamage"
    | "sourcePreviewImage"
  >;
  actorId: string;
  actorName: string;
  actorKind?: WorkshopWorkflowActorKind;
  session?: ClientSession;
}): Promise<EquipmentWorkshopRequestDoc | null> {
  const now = new Date();
  const updated = await (await equipmentWorkshopRequestsCol()).findOneAndUpdate(
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
        ...(input.sourceSnapshot ?? {}),
        ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
      },
      $push: {
        history: {
          status: "QUOTED",
          at: now,
          actorId: input.actorId,
          actorName: input.actorName,
          quoteVersion: input.quote.version,
        },
        discordDmOutbox: createEquipmentWorkshopDiscordDmOutboxEvent({
          event: "QUOTED",
          createdAt: now,
          payload: {
            equipmentName: input.quote.result.name,
            quoteVersion: input.quote.version,
            totalCost: input.quote.totalCost,
            durationMinutes: input.quote.durationMinutes,
            ...(input.quote.specialistWorkflow
              ? { specialistWorkflow: input.quote.specialistWorkflow }
              : {}),
          },
        }),
      },
    },
    { returnDocument: "after", session: input.session },
  );
  if (updated) {
    await enqueueEquipmentWorkshopWorkflowStages({
      request: updated,
      stage: "QUOTED",
      actorName: input.actorName,
      actorKind: input.actorKind ?? "GM",
      occurredAt: now,
      session: input.session,
    });
  }
  return updated;
}

export async function transitionEquipmentWorkshopRequest(input: {
  requestId: string;
  currentStatus: EquipmentWorkshopRequestStatus;
  status: EquipmentWorkshopRequestStatus;
  actorId: string;
  actorName: string;
  actorKind?: WorkshopWorkflowActorKind;
  note?: string;
  set?: Record<string, unknown>;
  expectedQuoteVersion?: number;
  unset?: Record<string, "">;
  session?: ClientSession;
}): Promise<EquipmentWorkshopRequestDoc | null> {
  const now = new Date();
  const closesOperation = ["DECLINED", "REJECTED", "CANCELLED", "COMPLETED"].includes(
    input.status,
  );
  const waitsForInFlightReadyDm =
    input.currentStatus === "IN_PROGRESS" && closesOperation;
  const unset = {
    ...(input.unset ?? {}),
    ...(closesOperation ? { activeOperationKey: "" as const } : {}),
  };
  const updated = await (await equipmentWorkshopRequestsCol()).findOneAndUpdate(
    {
      _id: input.requestId,
      status: input.currentStatus,
      ...(input.expectedQuoteVersion !== undefined
        ? { "quote.version": input.expectedQuoteVersion }
        : {}),
      ...(waitsForInFlightReadyDm
        ? {
            $or: [
              { "discordDmDelivery.leaseUntil": { $exists: false } },
              { "discordDmDelivery.leaseUntil": { $lte: now } },
            ],
          }
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
        discordDmOutbox: {
          $each: createEquipmentWorkshopStatusDmOutboxEvents({
            status: input.status,
            at: now,
            ...(input.expectedQuoteVersion !== undefined
              ? { quoteVersion: input.expectedQuoteVersion }
              : {}),
            ...(input.set?.readyAt instanceof Date
              ? { readyAt: input.set.readyAt }
              : {}),
            ...(input.note ? { note: input.note } : {}),
          }),
        },
      },
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
    { returnDocument: "after", session: input.session },
  );
  if (updated) {
    await enqueueEquipmentWorkshopWorkflowStages({
      request: updated,
      stage: input.status,
      actorName: input.actorName,
      actorKind: input.actorKind ?? "SYSTEM",
      occurredAt: now,
      session: input.session,
    });
  }
  return updated;
}
