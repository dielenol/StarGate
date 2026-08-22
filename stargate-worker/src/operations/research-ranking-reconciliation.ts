import { createHash } from "node:crypto";

import {
  RESEARCH_RANKING_STATE_COLLECTION,
  RESEARCH_RANKING_STATE_ID,
  getDb,
  type ResearchRankingState,
} from "@stargate/shared-db";
import type { Db, Filter, UpdateFilter } from "mongodb";

const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const TARGET_FINGERPRINT_PATTERN = /^mongo-target-v1:[a-f0-9]{64}$/;
const OWNERSHIP_PROOF_PATTERN =
  /^discord-webhook-message-v1:[a-f0-9]{64}$/;

export type ResearchRankingReconciliationAction = "adopt" | "retry";

export interface ResearchRankingReconciliationPlan {
  stateId: typeof RESEARCH_RANKING_STATE_ID;
  targetFingerprint: string;
  action: ResearchRankingReconciliationAction;
  requestedRevision: number;
  syncedRevision: number;
  deliveryUnknownRevision: number;
  deliveryUnknownAt: string | null;
  activeMessageIds: string[];
  candidateMessageId: string | null;
  candidateOwnershipProof: string | null;
  nextSyncedRevision: number;
  nextMessageIds: string[];
  staleMessageIds: string[];
  planDigest: string;
}

export interface ResearchRankingReconciliationResult {
  status: "applied" | "planned";
  plan: ResearchRankingReconciliationPlan;
}

interface ReconciliationState {
  _id: typeof RESEARCH_RANKING_STATE_ID;
  requestedRevision: number;
  syncedRevision: number;
  messageIds?: string[];
  replacementMessageIds?: string[];
  staleMessageIds?: string[];
  cleanupMessageIds?: string[];
  leaseToken?: string;
  deliveryUnknownRevision?: number;
  deliveryUnknownAt?: Date;
}

export class ResearchRankingReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchRankingReconciliationError";
  }
}

export function buildMongoTargetFingerprint(input: {
  uri: string;
  dbName: string;
}): string {
  const schemeMatch = /^(mongodb(?:\+srv)?):\/\//i.exec(input.uri.trim());
  const dbName = input.dbName.trim();
  if (!schemeMatch || !dbName) {
    throw new ResearchRankingReconciliationError(
      "MongoDB 배포 대상 identity를 확인할 수 없습니다.",
    );
  }
  const rest = input.uri.trim().slice(schemeMatch[0].length);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd >= 0 ? rest.slice(0, authorityEnd) : rest;
  const credentialSeparator = authority.lastIndexOf("@");
  const rawHosts = authority.slice(credentialSeparator + 1);
  const hosts = rawHosts
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  if (hosts.length === 0 || hosts.some((host) => /[\s@]/.test(host))) {
    throw new ResearchRankingReconciliationError(
      "MongoDB 배포 대상 identity를 확인할 수 없습니다.",
    );
  }
  const digest = createHash("sha256")
    .update(
      `mongo-target-v1\0${schemeMatch[1].toLowerCase()}\0${hosts.join(",")}\0${dbName}`,
    )
    .digest("hex");
  return `mongo-target-v1:${digest}`;
}

function uniqueMessageIds(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])];
}

function requireValidMessageIds(values: readonly string[], label: string): void {
  if (values.some((value) => !DISCORD_SNOWFLAKE_PATTERN.test(value))) {
    throw new ResearchRankingReconciliationError(
      `${label}에 올바르지 않은 Discord message ID가 있습니다.`,
    );
  }
}

function hasPendingCleanup(state: ReconciliationState): boolean {
  return [
    state.replacementMessageIds,
    state.staleMessageIds,
    state.cleanupMessageIds,
  ].some((values) => (values?.length ?? 0) > 0);
}

function buildPlan(
  state: ReconciliationState,
  input: {
    targetFingerprint: string;
    action: ResearchRankingReconciliationAction;
    candidateMessageId?: string;
    candidateOwnershipProof?: string;
  },
): ResearchRankingReconciliationPlan {
  if (!TARGET_FINGERPRINT_PATTERN.test(input.targetFingerprint)) {
    throw new ResearchRankingReconciliationError(
      "reconciliation 대상 MongoDB fingerprint가 올바르지 않습니다.",
    );
  }
  const unknownRevision = state.deliveryUnknownRevision;
  if (!Number.isInteger(unknownRevision) || (unknownRevision ?? 0) <= 0) {
    throw new ResearchRankingReconciliationError(
      "연구 공로 카드가 DELIVERY_UNKNOWN 격리 상태가 아닙니다.",
    );
  }
  if (
    state.syncedRevision >= unknownRevision! ||
    unknownRevision! > state.requestedRevision
  ) {
    throw new ResearchRankingReconciliationError(
      "연구 공로 카드 revision 상태가 격리 계약과 일치하지 않습니다.",
    );
  }
  if (
    !(state.deliveryUnknownAt instanceof Date) ||
    Number.isNaN(state.deliveryUnknownAt.getTime())
  ) {
    throw new ResearchRankingReconciliationError(
      "DELIVERY_UNKNOWN 발생 시각이 없어 Discord 채널 후보를 안전하게 대조할 수 없습니다.",
    );
  }
  if (state.leaseToken !== undefined) {
    throw new ResearchRankingReconciliationError(
      "연구 공로 카드 lease가 남아 있습니다. worker가 lease를 해제한 뒤 다시 확인하세요.",
    );
  }
  if (hasPendingCleanup(state)) {
    throw new ResearchRankingReconciliationError(
      "Discord message 정리 작업이 남아 있습니다. worker 정리 완료 뒤 다시 확인하세요.",
    );
  }

  const activeMessageIds = uniqueMessageIds(state.messageIds);
  requireValidMessageIds(activeMessageIds, "현재 활성 카드");

  const candidateMessageId = input.candidateMessageId?.trim() || null;
  if (input.action === "adopt") {
    if (
      !candidateMessageId ||
      !DISCORD_SNOWFLAKE_PATTERN.test(candidateMessageId)
    ) {
      throw new ResearchRankingReconciliationError(
        "adopt에는 올바른 Discord candidate message ID가 필요합니다.",
      );
    }
    if (activeMessageIds.includes(candidateMessageId)) {
      throw new ResearchRankingReconciliationError(
        "adopt 후보는 현재 활성 카드와 다른 Discord message여야 합니다.",
      );
    }
    if (!OWNERSHIP_PROOF_PATTERN.test(input.candidateOwnershipProof ?? "")) {
      throw new ResearchRankingReconciliationError(
        "adopt 후보가 설정된 연구 webhook 소유임을 확인하지 못했습니다.",
      );
    }
  } else if (candidateMessageId) {
    throw new ResearchRankingReconciliationError(
      "retry에는 candidate message ID를 지정할 수 없습니다.",
    );
  }

  const nextMessageIds = candidateMessageId
    ? [candidateMessageId]
    : activeMessageIds;
  const staleMessageIds = candidateMessageId
    ? activeMessageIds.filter((messageId) => messageId !== candidateMessageId)
    : [];
  const planCore = {
    stateId: RESEARCH_RANKING_STATE_ID,
    targetFingerprint: input.targetFingerprint,
    action: input.action,
    requestedRevision: state.requestedRevision,
    syncedRevision: state.syncedRevision,
    deliveryUnknownRevision: unknownRevision!,
    deliveryUnknownAt: state.deliveryUnknownAt?.toISOString() ?? null,
    activeMessageIds,
    candidateMessageId,
    candidateOwnershipProof:
      input.action === "adopt" ? input.candidateOwnershipProof! : null,
    nextSyncedRevision:
      input.action === "adopt" ? unknownRevision! : state.syncedRevision,
    nextMessageIds,
    staleMessageIds,
  } satisfies Omit<ResearchRankingReconciliationPlan, "planDigest">;
  const planDigest = createHash("sha256")
    .update(JSON.stringify(planCore))
    .digest("hex");

  return { ...planCore, planDigest };
}

function exactOptionalArrayFilter(
  state: ReconciliationState,
  key: "cleanupMessageIds" | "messageIds" | "replacementMessageIds" | "staleMessageIds",
): Filter<ResearchRankingState> {
  return Object.hasOwn(state, key)
    ? ({ [key]: state[key] ?? [] } as Filter<ResearchRankingState>)
    : ({ [key]: { $exists: false } } as Filter<ResearchRankingState>);
}

function reconciliationFilter(
  state: ReconciliationState,
  plan: ResearchRankingReconciliationPlan,
): Filter<ResearchRankingState> {
  return {
    _id: RESEARCH_RANKING_STATE_ID,
    requestedRevision: plan.requestedRevision,
    syncedRevision: plan.syncedRevision,
    deliveryUnknownRevision: plan.deliveryUnknownRevision,
    leaseToken: { $exists: false },
    ...(state.deliveryUnknownAt
      ? { deliveryUnknownAt: state.deliveryUnknownAt }
      : { deliveryUnknownAt: { $exists: false } }),
    $and: [
      exactOptionalArrayFilter(state, "messageIds"),
      exactOptionalArrayFilter(state, "replacementMessageIds"),
      exactOptionalArrayFilter(state, "staleMessageIds"),
      exactOptionalArrayFilter(state, "cleanupMessageIds"),
    ],
  };
}

function reconciliationUpdate(
  plan: ResearchRankingReconciliationPlan,
  now: Date,
): UpdateFilter<ResearchRankingState> {
  const unset: NonNullable<UpdateFilter<ResearchRankingState>["$unset"]> = {
    deliveryUnknownRevision: "",
    deliveryUnknownAt: "",
    lastError: "",
    nextAttemptAt: "",
    leaseToken: "",
    leaseExpiresAt: "",
    replacementMessageIds: "",
    cleanupMessageIds: "",
    ...(plan.action === "retry" || plan.staleMessageIds.length === 0
      ? { staleMessageIds: "" }
      : {}),
  };

  if (plan.action === "retry") {
    return {
      $set: { updatedAt: now },
      $unset: unset,
    };
  }

  return {
    $set: {
      syncedRevision: plan.nextSyncedRevision,
      messageIds: plan.nextMessageIds,
      ...(plan.staleMessageIds.length > 0
        ? { staleMessageIds: plan.staleMessageIds }
        : {}),
      updatedAt: now,
    },
    $unset: unset,
  };
}

async function loadState(db: Db): Promise<ReconciliationState> {
  const state = await db
    .collection<ReconciliationState>(RESEARCH_RANKING_STATE_COLLECTION)
    .findOne(
      { _id: RESEARCH_RANKING_STATE_ID },
      {
        projection: {
          requestedRevision: 1,
          syncedRevision: 1,
          messageIds: 1,
          replacementMessageIds: 1,
          staleMessageIds: 1,
          cleanupMessageIds: 1,
          leaseToken: 1,
          deliveryUnknownRevision: 1,
          deliveryUnknownAt: 1,
        },
      },
    );
  if (!state) {
    throw new ResearchRankingReconciliationError(
      "연구 공로 ranking state가 없습니다.",
    );
  }
  return state;
}

export async function reconcileResearchRankingDeliveryUnknown(
  input: {
    targetFingerprint: string;
    action: ResearchRankingReconciliationAction;
    candidateMessageId?: string;
    execute?: boolean;
    expectedPlanDigest?: string;
  },
  dependencies: {
    getDbImpl?: typeof getDb;
    now?: () => Date;
    verifyCandidateMessageOwnership?: (messageId: string) => Promise<string>;
  } = {},
): Promise<ResearchRankingReconciliationResult> {
  const db = await (dependencies.getDbImpl ?? getDb)();
  const state = await loadState(db);
  const candidateMessageId = input.candidateMessageId?.trim() || undefined;
  let candidateOwnershipProof: string | undefined;
  if (input.action === "adopt") {
    if (
      !candidateMessageId ||
      !DISCORD_SNOWFLAKE_PATTERN.test(candidateMessageId)
    ) {
      throw new ResearchRankingReconciliationError(
        "adopt에는 올바른 Discord candidate message ID가 필요합니다.",
      );
    }
    if (uniqueMessageIds(state.messageIds).includes(candidateMessageId)) {
      throw new ResearchRankingReconciliationError(
        "adopt 후보는 현재 활성 카드와 다른 Discord message여야 합니다.",
      );
    }
    if (!dependencies.verifyCandidateMessageOwnership) {
      throw new ResearchRankingReconciliationError(
        "adopt 후보의 연구 webhook 소유권 검증기가 필요합니다.",
      );
    }
    candidateOwnershipProof =
      await dependencies.verifyCandidateMessageOwnership(candidateMessageId);
  }
  const plan = buildPlan(state, {
    targetFingerprint: input.targetFingerprint,
    action: input.action,
    ...(candidateMessageId ? { candidateMessageId } : {}),
    ...(candidateOwnershipProof ? { candidateOwnershipProof } : {}),
  });
  if (!input.execute) return { status: "planned", plan };

  if (input.expectedPlanDigest !== plan.planDigest) {
    throw new ResearchRankingReconciliationError(
      "현재 reconciliation plan이 dry-run에서 확인한 digest와 다릅니다.",
    );
  }

  const result = await db
    .collection<ResearchRankingState>(RESEARCH_RANKING_STATE_COLLECTION)
    .updateOne(
      reconciliationFilter(state, plan),
      reconciliationUpdate(plan, dependencies.now?.() ?? new Date()),
    );
  if (result.modifiedCount !== 1) {
    throw new ResearchRankingReconciliationError(
      "reconciliation CAS 조건이 변경되어 적용하지 않았습니다.",
    );
  }

  const verified = await db
    .collection<ResearchRankingState>(RESEARCH_RANKING_STATE_COLLECTION)
    .findOne(
      { _id: RESEARCH_RANKING_STATE_ID },
      {
        projection: {
          requestedRevision: 1,
          syncedRevision: 1,
          messageIds: 1,
          deliveryUnknownRevision: 1,
        },
      },
    );
  if (!verified || verified.deliveryUnknownRevision !== undefined) {
    throw new ResearchRankingReconciliationError(
      "reconciliation 적용 뒤 격리 해제를 재확인하지 못했습니다.",
    );
  }

  return { status: "applied", plan };
}
