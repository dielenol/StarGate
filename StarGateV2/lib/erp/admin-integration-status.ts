import "server-only";
import "@/lib/db/init";

import {
  SCHEDULED_JOB_NAMES,
  expectedResearchDailyRankingSlot,
  isResearchDailyRankingCadenceOverdue,
} from "@stargate/core";
import {
  INTEGRATION_OUTBOX_KINDS,
  RESEARCH_RANKING_STATE_COLLECTION,
  RESEARCH_RANKING_STATE_ID,
  getDb,
  type IntegrationOutboxKind,
  type ScheduledJobRun,
} from "@stargate/shared-db";

import type {
  AdminDelegatedWorkflowStatus,
  AdminDesiredStateStatus,
  AdminIntegrationErrorCategory,
  AdminIntegrationHealth,
  AdminIntegrationStatusResponse,
  AdminOutboxKindStatus,
  AdminScheduledJobStatus,
} from "@/types/admin-integration-status";

const OUTBOX_WARNING_AFTER_MS = 10 * 60_000;
const WORKER_STALE_AFTER_MS = 90_000;
const FALLBACK_EXPECTED_CONSUMERS = [
  "ameri-dm",
  "research-card",
  "research-ranking",
  "shop-restock",
  "stock-market-wire",
];

interface WorkerRuntimeStatusDocument {
  _id: "active";
  mode?: "shadow" | "active";
  ready?: boolean;
  enabledConsumers?: string[];
  expectedConsumers?: string[];
  enabledOutboxKinds?: IntegrationOutboxKind[];
  lastSeenAt?: Date;
}

interface DesiredStateDocument {
  _id: string;
  requestedRevision?: number;
  syncedRevision?: number;
  leaseToken?: string;
  leaseExpiresAt?: Date;
  nextAttemptAt?: Date;
  lastError?: string;
  deliveryUnknownRevision?: number;
  updatedAt?: Date;
}

interface WorkshopDelegationDocument {
  discordDmOutbox?: Array<{
    availableAt: Date;
    sentAt?: Date;
    skippedAt?: Date;
  }>;
  discordDmDelivery?: {
    leaseUntil?: Date;
    nextAttemptAt?: Date;
    lastError?: string;
  };
}

interface OutboxAggregateRow {
  _id: IntegrationOutboxKind;
  dueCount: number;
  scheduledCount: number;
  processingCount: number;
  expiredLeaseCount: number;
  retryingCount: number;
  deadCount: number;
  maxAttempts: number;
  oldestDueAt: Date;
}

interface DeliveredAggregateRow {
  _id: IntegrationOutboxKind;
  lastDeliveredAt: Date;
  sentCount: number;
  skippedCount: number;
  unclassifiedCount: number;
}

function iso(value: Date | undefined | null): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function maxHealth(
  values: AdminIntegrationHealth[],
): AdminIntegrationHealth {
  const rank: Record<AdminIntegrationHealth, number> = {
    HEALTHY: 0,
    UNKNOWN: 1,
    WARNING: 2,
    CRITICAL: 3,
  };
  return values.reduce(
    (worst, value) => (rank[value] > rank[worst] ? value : worst),
    "HEALTHY" as AdminIntegrationHealth,
  );
}

function errorCategory(value: string): AdminIntegrationErrorCategory {
  const error = value.toLowerCase();
  if (/webhook|환경변수|config|설정/.test(error)) return "CONFIG";
  if (/401|403|unauthorized|forbidden|token/.test(error)) return "AUTH";
  if (/429|rate.?limit/.test(error)) return "RATE_LIMIT";
  if (/timeout|fetch|network|econn|socket/.test(error)) return "NETWORK";
  if (/payload|version|지원하지|올바르지/.test(error)) return "PAYLOAD";
  if (/lease/.test(error)) return "LEASE";
  return "UNKNOWN";
}

function channelFor(kind: IntegrationOutboxKind): AdminOutboxKindStatus["channel"] {
  if (kind === "PLAYER_TRADE_DM") return "DM";
  if (
    kind === "SHOP_REORDER_FULFILLED_WEBHOOK" ||
    kind === "SHOP_PRODUCT_LAUNCH_WEBHOOK" ||
    kind === "MRBEAST_LOTTERY_WINNER_WEBHOOK"
  ) return "편의점";
  if (kind === "STOCK_MANUAL_INTERVENTION_WEBHOOK") return "주식";
  if (
    kind === "EQUIPMENT_WORKSHOP_WEBHOOK" ||
    kind === "SHOP_REORDER_REQUEST_WEBHOOK" ||
    kind === "WORKFLOW_STATUS_WEBHOOK"
  ) return "워크플로";
  return "감사";
}

function buildOutboxStatuses(input: {
  rows: Map<IntegrationOutboxKind, OutboxAggregateRow>;
  delivered: Map<IntegrationOutboxKind, DeliveredAggregateRow>;
  enabledKinds: Set<IntegrationOutboxKind> | null;
  now: Date;
}): AdminOutboxKindStatus[] {
  return INTEGRATION_OUTBOX_KINDS.map((kind) => {
    const row = input.rows.get(kind);
    const oldestDue = row?.dueCount ? row.oldestDueAt : null;
    const enabledByWorker = input.enabledKinds
      ? input.enabledKinds.has(kind)
      : null;
    const delivered = input.delivered.get(kind);
    const health: AdminIntegrationHealth =
      (row?.deadCount ?? 0) > 0 ||
      (row?.expiredLeaseCount ?? 0) > 0 ||
      enabledByWorker === false
        ? "CRITICAL"
        : (row?.retryingCount ?? 0) > 0 ||
            (oldestDue &&
              input.now.getTime() - oldestDue.getTime() >=
                OUTBOX_WARNING_AFTER_MS)
          ? "WARNING"
          : "HEALTHY";
    return {
      kind,
      channel: channelFor(kind),
      health,
      dueCount: row?.dueCount ?? 0,
      scheduledCount: row?.scheduledCount ?? 0,
      processingCount: row?.processingCount ?? 0,
      expiredLeaseCount: row?.expiredLeaseCount ?? 0,
      retryingCount: row?.retryingCount ?? 0,
      deadCount: row?.deadCount ?? 0,
      maxAttempts: row?.maxAttempts ?? 0,
      oldestDueAt: iso(oldestDue),
      lastDeliveredAt: iso(delivered?.lastDeliveredAt),
      sentCount: delivered?.sentCount ?? 0,
      skippedCount: delivered?.skippedCount ?? 0,
      unclassifiedCount: delivered?.unclassifiedCount ?? 0,
      enabledByWorker,
    };
  });
}

function buildDesiredStateStatus(input: {
  key: AdminDesiredStateStatus["key"];
  label: string;
  docs: DesiredStateDocument[];
  now: Date;
}): AdminDesiredStateStatus {
  let pendingCount = 0;
  let revisionLag = 0;
  let inFlightCount = 0;
  let errorCount = 0;
  let oldestPending: Date | null = null;
  let updatedAt: Date | null = null;
  const categories = new Set<AdminIntegrationErrorCategory>();
  for (const doc of input.docs) {
    const lag = Math.max(
      0,
      (doc.requestedRevision ?? 0) - (doc.syncedRevision ?? 0),
    );
    revisionLag += lag;
    if (lag > 0) {
      pendingCount += 1;
      if (doc.updatedAt && (!oldestPending || doc.updatedAt < oldestPending)) {
        oldestPending = doc.updatedAt;
      }
    }
    if (doc.leaseToken && (!doc.leaseExpiresAt || doc.leaseExpiresAt > input.now)) {
      inFlightCount += 1;
    }
    const deliveryUnknown = doc.deliveryUnknownRevision !== undefined;
    if (doc.lastError || deliveryUnknown) {
      errorCount += 1;
      if (deliveryUnknown) categories.add("UNKNOWN");
      else if (doc.lastError) categories.add(errorCategory(doc.lastError));
    }
    if (doc.updatedAt && (!updatedAt || doc.updatedAt > updatedAt)) {
      updatedAt = doc.updatedAt;
    }
  }
  const health: AdminIntegrationHealth =
    errorCount > 0
      ? "CRITICAL"
      : oldestPending && input.now.getTime() - oldestPending.getTime() >= OUTBOX_WARNING_AFTER_MS
        ? "WARNING"
        : "HEALTHY";
  return {
    key: input.key,
    label: input.label,
    health,
    documentCount: input.docs.length,
    pendingCount,
    revisionLag,
    inFlightCount,
    errorCount,
    errorCategories: [...categories],
    oldestPendingAt: iso(oldestPending),
    updatedAt: iso(updatedAt),
  };
}

export async function getAdminIntegrationStatusResponse(): Promise<AdminIntegrationStatusResponse> {
  const db = await getDb();
  const now = new Date();
  const oldestDueSentinel = new Date("9999-12-31T23:59:59.999Z");
  const [
    outboxRows,
    deliveredRows,
    workerRuntime,
    researchStates,
    researchRankingStates,
    shopStates,
    stockStates,
    workshopRequests,
    voteRows,
    scheduledRows,
  ] = await Promise.all([
    db.collection("integration_outbox")
      .aggregate<OutboxAggregateRow>([
        { $match: { status: { $ne: "DELIVERED" } } },
        {
          $group: {
            _id: "$kind",
            dueCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "PENDING"] },
                      { $lte: ["$availableAt", now] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            scheduledCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "PENDING"] },
                      { $gt: ["$availableAt", now] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            processingCount: {
              $sum: { $cond: [{ $eq: ["$status", "PROCESSING"] }, 1, 0] },
            },
            expiredLeaseCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "PROCESSING"] },
                      {
                        $or: [
                          { $ne: [{ $type: "$leaseUntil" }, "date"] },
                          { $lte: ["$leaseUntil", now] },
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            retryingCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "PENDING"] },
                      { $gt: ["$attempts", 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            deadCount: {
              $sum: { $cond: [{ $eq: ["$status", "DEAD"] }, 1, 0] },
            },
            maxAttempts: { $max: "$attempts" },
            oldestDueAt: {
              $min: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "PENDING"] },
                      { $lte: ["$availableAt", now] },
                    ],
                  },
                  "$availableAt",
                  oldestDueSentinel,
                ],
              },
            },
          },
        },
      ])
      .toArray(),
    db.collection("integration_outbox")
      .aggregate<DeliveredAggregateRow>([
        { $match: { status: "DELIVERED", deliveredAt: { $type: "date" } } },
        {
          $group: {
            _id: "$kind",
            lastDeliveredAt: { $max: "$deliveredAt" },
            sentCount: {
              $sum: { $cond: [{ $eq: ["$deliveryOutcome", "SENT"] }, 1, 0] },
            },
            skippedCount: {
              $sum: { $cond: [{ $eq: ["$deliveryOutcome", "SKIPPED"] }, 1, 0] },
            },
            unclassifiedCount: {
              $sum: {
                $cond: [
                  { $in: ["$deliveryOutcome", ["SENT", "SKIPPED"]] },
                  0,
                  1,
                ],
              },
            },
          },
        },
      ])
      .toArray(),
    db.collection<WorkerRuntimeStatusDocument>("worker_runtime_status")
      .findOne({ _id: "active" }),
    db.collection<DesiredStateDocument>("research_discord_cards").find({}).toArray(),
    db.collection<DesiredStateDocument>(RESEARCH_RANKING_STATE_COLLECTION)
      .find({ _id: RESEARCH_RANKING_STATE_ID })
      .toArray(),
    db.collection<DesiredStateDocument>("shop_restock_notifications").find({}).toArray(),
    db.collection<DesiredStateDocument>("stock_discord_market_wires")
      .find({ _id: "scheduled" })
      .toArray(),
    db.collection<WorkshopDelegationDocument>("equipment_workshop_requests")
      .find({
        $or: [
          {
            discordDmOutbox: {
              $elemMatch: {
                sentAt: { $exists: false },
                skippedAt: { $exists: false },
              },
            },
          },
          { "discordDmDelivery.lastError": { $exists: true } },
        ],
      })
      .project<WorkshopDelegationDocument>({ discordDmOutbox: 1, discordDmDelivery: 1 })
      .toArray(),
    db.collection("bureaucrat_votes")
      .find({ status: "OPEN" })
      .project<{
        publication?: { state?: string; lastError?: string };
        updatedAt?: Date;
      }>({
        publication: 1,
        updatedAt: 1,
      })
      .toArray(),
    db.collection<ScheduledJobRun>("scheduled_job_runs")
      .aggregate<ScheduledJobRun>([
        { $sort: { updatedAt: -1 } },
        { $group: { _id: "$jobName", row: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$row" } },
      ])
      .toArray(),
  ]);

  const delivered = new Map(deliveredRows.map((row) => [row._id, row]));
  const workerFresh = Boolean(
    workerRuntime?.lastSeenAt &&
      now.getTime() - workerRuntime.lastSeenAt.getTime() < WORKER_STALE_AFTER_MS,
  );
  const expectedConsumers =
    workerRuntime?.expectedConsumers?.length
      ? workerRuntime.expectedConsumers
      : FALLBACK_EXPECTED_CONSUMERS;
  const enabledConsumers = workerRuntime?.enabledConsumers ?? [];
  const enabledConsumerSet = new Set(enabledConsumers);
  const missingConsumers = expectedConsumers.filter(
    (consumer) => !enabledConsumerSet.has(consumer),
  );
  const worker = {
    health: !workerRuntime?.lastSeenAt
      ? "UNKNOWN" as const
      : workerRuntime.ready === undefined || workerRuntime.mode === undefined
        ? "UNKNOWN" as const
        : workerFresh &&
            workerRuntime.ready &&
            workerRuntime.mode === "active" &&
            missingConsumers.length === 0
        ? "HEALTHY" as const
        : "CRITICAL" as const,
    mode: workerRuntime?.mode ?? null,
    lastSeenAt: iso(workerRuntime?.lastSeenAt),
    enabledConsumers,
    expectedConsumers,
    missingConsumers,
    enabledOutboxKinds: workerRuntime?.enabledOutboxKinds ?? [],
  };
  const outbox = buildOutboxStatuses({
    rows: new Map(outboxRows.map((row) => [row._id, row])),
    delivered,
    enabledKinds: workerRuntime
      ? new Set(workerRuntime.enabledOutboxKinds ?? [])
      : null,
    now,
  });
  const desiredStates = [
    buildDesiredStateStatus({
      key: "RESEARCH",
      label: "장비 연구 카드",
      docs: researchStates,
      now,
    }),
    buildDesiredStateStatus({
      key: "RESEARCH_RANKING",
      label: "연구 공로 일일 카드",
      docs: researchRankingStates,
      now,
    }),
    buildDesiredStateStatus({
      key: "SHOP_RESTOCK",
      label: "편의점 입고 카드",
      docs: shopStates.filter((doc) => doc._id === "daily-shop-restock"),
      now,
    }),
    buildDesiredStateStatus({
      key: "STOCK_MARKET_WIRE",
      label: "주식 시장 공시",
      docs: stockStates,
      now,
    }),
  ];

  let workshopDue = 0;
  let workshopScheduled = 0;
  let workshopInFlight = 0;
  let workshopErrors = 0;
  for (const request of workshopRequests) {
    for (const event of request.discordDmOutbox ?? []) {
      if (event.sentAt || event.skippedAt) continue;
      if (event.availableAt <= now) workshopDue += 1;
      else workshopScheduled += 1;
    }
    if (request.discordDmDelivery?.leaseUntil && request.discordDmDelivery.leaseUntil > now) {
      workshopInFlight += 1;
    }
    if (request.discordDmDelivery?.lastError) workshopErrors += 1;
  }
  const voteStale = voteRows.filter(
    (vote) =>
      Boolean(vote.publication?.lastError) ||
      (vote.publication?.state !== "SENT" &&
        vote.updatedAt &&
        now.getTime() - vote.updatedAt.getTime() >= OUTBOX_WARNING_AFTER_MS),
  ).length;
  const delegatedWorkflows: AdminDelegatedWorkflowStatus[] = [
    {
      key: "AMERI_WORKSHOP_DM",
      label: "AMERI 공방 DM",
      health: missingConsumers.includes("ameri-dm")
        ? "CRITICAL"
        : workshopErrors > 0
        ? "CRITICAL"
        : workshopDue > 0
          ? "WARNING"
          : "HEALTHY",
      dueCount: workshopDue,
      scheduledCount: workshopScheduled,
      inFlightCount: workshopInFlight,
      errorCount: workshopErrors,
    },
    {
      key: "REGISTRAR_BUREAUCRAT_VOTE",
      label: "REGISTRAR 관료 표결",
      health: voteStale > 0 ? "WARNING" : "HEALTHY",
      dueCount: voteRows.filter((vote) => vote.publication?.state === "PENDING").length,
      scheduledCount: 0,
      inFlightCount: voteRows.filter((vote) => vote.publication?.state === "DISPATCHING").length,
      errorCount: voteStale,
    },
  ];
  const latestJobs = new Map(scheduledRows.map((row) => [row.jobName, row]));
  const scheduledJobs: AdminScheduledJobStatus[] = SCHEDULED_JOB_NAMES.map((jobName) => {
    const row = latestJobs.get(jobName);
    const status = row?.status ?? "UNKNOWN";
    const isResearchRanking = jobName === "research.daily-ranking";
    const cadenceOverdue = isResearchRanking
      ? isResearchDailyRankingCadenceOverdue(row?.slotKey, now)
      : false;
    return {
      jobName,
      health: !row
        ? cadenceOverdue
          ? "WARNING"
          : "UNKNOWN"
        : status === "DEAD"
          ? "CRITICAL"
          : status === "FAILED" || status === "RUNNING"
            ? "WARNING"
            : cadenceOverdue
              ? "WARNING"
              : "HEALTHY",
      status,
      attempts: row?.attempts ?? 0,
      cadenceOverdue,
      expectedSlotKey: isResearchRanking
        ? expectedResearchDailyRankingSlot(now)
        : null,
      updatedAt: iso(row?.updatedAt),
      completedAt: iso(row?.completedAt),
    };
  });
  const healthValues = [
    worker.health,
    ...outbox.map((item) => item.health),
    ...desiredStates.map((item) => item.health),
    ...delegatedWorkflows.map((item) => item.health),
    ...scheduledJobs.map((item) => item.health),
  ];
  return {
    generatedAt: now.toISOString(),
    overallHealth: maxHealth(healthValues),
    summary: {
      dueCount: outbox.reduce((sum, item) => sum + item.dueCount, 0),
      scheduledCount: outbox.reduce((sum, item) => sum + item.scheduledCount, 0),
      expiredLeaseCount: outbox.reduce(
        (sum, item) => sum + item.expiredLeaseCount,
        0,
      ),
      deadCount: outbox.reduce((sum, item) => sum + item.deadCount, 0),
      desiredStateIssues: desiredStates.reduce(
        (sum, item) => sum + item.errorCount + item.pendingCount,
        0,
      ),
      delegatedWorkflowIssues: delegatedWorkflows.reduce(
        (sum, item) => sum + item.errorCount + item.dueCount,
        0,
      ),
      sentCount: outbox.reduce((sum, item) => sum + item.sentCount, 0),
      skippedCount: outbox.reduce((sum, item) => sum + item.skippedCount, 0),
      unclassifiedCount: outbox.reduce(
        (sum, item) => sum + item.unclassifiedCount,
        0,
      ),
    },
    worker,
    outbox,
    desiredStates,
    delegatedWorkflows,
    scheduledJobs,
    legacy: { shopRestockDocuments: shopStates.length },
  };
}
