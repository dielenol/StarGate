import {
  RESEARCH_RANKING_STATE_COLLECTION,
  RESEARCH_RANKING_STATE_ID,
  getDb,
} from "@stargate/shared-db";
import type { Filter } from "mongodb";

import {
  WORKER_CONSUMER_NAMES,
  type WorkerConsumerName,
} from "../config.js";
import type { DueWorkConsumerPort } from "./port.js";

const STALE_AFTER_MS = 10 * 60_000;
const DESIRED_STATE_SOURCES: Array<{
  collectionName: string;
  stateId?: string;
}> = [
  { collectionName: "research_discord_cards" },
  {
    collectionName: RESEARCH_RANKING_STATE_COLLECTION,
    stateId: RESEARCH_RANKING_STATE_ID,
  },
  {
    collectionName: "shop_restock_notifications",
    stateId: "daily-shop-restock",
  },
  {
    collectionName: "stock_discord_market_wires",
    stateId: "scheduled",
  },
];

interface DesiredStateDocument {
  _id: string;
  requestedRevision: number;
  syncedRevision: number;
  lastError?: string;
  deliveryUnknownRevision?: number;
  updatedAt: Date;
}

export function buildDesiredStateIssueFilter(
  stateId: string | undefined,
  staleBefore: Date,
): Filter<DesiredStateDocument> {
  return {
    ...(stateId ? { _id: stateId } : {}),
    $or: [
      { lastError: { $exists: true, $ne: "" } },
      { deliveryUnknownRevision: { $exists: true } },
      {
        $expr: { $gt: ["$requestedRevision", "$syncedRevision"] },
        updatedAt: { $lte: staleBefore },
      },
    ],
  };
}

export function countEffectiveDesiredStateIssues(
  desired: number,
  deliveryUnknown: number,
): number {
  return Math.max(desired, deliveryUnknown);
}

interface IntegrationHealthAlertInput {
  dead: number;
  retrying: number;
  overdue: number;
  expiredLeases: number;
  desired: number;
  deliveryUnknown: number;
  workshopDmErrors: number;
  workshopDmOverdue: number;
  missingConsumers: readonly WorkerConsumerName[];
  votePublicationStalls: number;
  latestScheduledFailures: readonly { status: string }[];
}

export function buildIntegrationHealthOperationalAlert(
  input: IntegrationHealthAlertInput,
) {
  const {
    dead,
    retrying,
    overdue,
    expiredLeases,
    desired,
    deliveryUnknown,
    workshopDmErrors,
    workshopDmOverdue,
    missingConsumers,
    votePublicationStalls,
    latestScheduledFailures,
  } = input;
  const desiredWithoutUnknown = Math.max(0, desired - deliveryUnknown);
  const parts = [
    dead > 0 ? `outbox DEAD ${dead}건` : null,
    retrying > 0 ? `outbox 재시도 ${retrying}건` : null,
    overdue > 0 ? `10분 초과 outbox ${overdue}건` : null,
    expiredLeases > 0 ? `만료 lease ${expiredLeases}건` : null,
    deliveryUnknown > 0
      ? `DELIVERY_UNKNOWN 격리 ${deliveryUnknown}건`
      : null,
    desiredWithoutUnknown > 0
      ? `desired-state 지연/오류 ${desiredWithoutUnknown}건`
      : null,
    workshopDmErrors > 0 ? `AMERI DM 지연 ${workshopDmErrors}건` : null,
    workshopDmOverdue > 0
      ? `AMERI DM 10분 초과 ${workshopDmOverdue}건`
      : null,
    missingConsumers.length > 0
      ? `consumer 누락 ${missingConsumers.join(", ")}`
      : null,
    votePublicationStalls > 0
      ? `REGISTRAR 표결 게시 지연 ${votePublicationStalls}건`
      : null,
    latestScheduledFailures.length > 0
      ? `예약 작업 실패 ${latestScheduledFailures.length}건`
      : null,
  ].filter((value): value is string => Boolean(value));
  const issueKinds = [
    dead > 0 ? "OUTBOX_DEAD" : null,
    retrying > 0 ? "OUTBOX_RETRYING" : null,
    overdue > 0 ? "OUTBOX_OVERDUE" : null,
    expiredLeases > 0 ? "OUTBOX_EXPIRED_LEASE" : null,
    deliveryUnknown > 0 ? "DELIVERY_UNKNOWN" : null,
    desiredWithoutUnknown > 0 ? "DESIRED_STATE" : null,
    workshopDmErrors > 0 ? "AMERI_DM" : null,
    workshopDmOverdue > 0 ? "AMERI_DM_OVERDUE" : null,
    missingConsumers.length > 0 ? "CONSUMER_MISSING" : null,
    votePublicationStalls > 0 ? "REGISTRAR_VOTE" : null,
    latestScheduledFailures.length > 0 ? "SCHEDULED_JOB" : null,
  ].filter((value): value is string => Boolean(value));
  const severity =
    dead > 0 ||
    expiredLeases > 0 ||
    deliveryUnknown > 0 ||
    missingConsumers.length > 0 ||
    latestScheduledFailures.some((row) => row.status === "DEAD")
      ? "CRITICAL" as const
      : "WARNING" as const;
  return {
    fingerprint: `${severity}:${issueKinds.join("|")}`,
    severity,
    summary: parts.join(" · "),
  };
}

export class IntegrationHealthProbeConsumer implements DueWorkConsumerPort {
  readonly name = "integration-health";

  constructor(
    private readonly options: {
      enabledConsumers?: readonly WorkerConsumerName[];
    } = {},
  ) {}

  async tick() {
    const db = await getDb();
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
    const [
      dead,
      retrying,
      overdue,
      expiredLeases,
      desiredStates,
      deliveryUnknown,
      workshopDmErrors,
      workshopDmOverdue,
      votePublicationStalls,
      latestScheduledFailures,
    ] =
      await Promise.all([
        db.collection("integration_outbox").countDocuments({ status: "DEAD" }),
        db.collection("integration_outbox").countDocuments({
          status: "PENDING",
          attempts: { $gt: 0 },
        }),
        db.collection("integration_outbox").countDocuments({
          status: "PENDING",
          attempts: 0,
          availableAt: { $lte: staleBefore },
        }),
        db.collection("integration_outbox").countDocuments({
          status: "PROCESSING",
          leaseUntil: { $lte: now },
        }),
        Promise.all(
          DESIRED_STATE_SOURCES.map(async ({ collectionName, stateId }) =>
            db
              .collection<DesiredStateDocument>(collectionName)
              .countDocuments(
                buildDesiredStateIssueFilter(stateId, staleBefore),
              ),
          ),
        ),
        db
          .collection<DesiredStateDocument>(RESEARCH_RANKING_STATE_COLLECTION)
          .countDocuments({
            _id: RESEARCH_RANKING_STATE_ID,
            deliveryUnknownRevision: { $exists: true },
          }),
        db.collection("equipment_workshop_requests").countDocuments({
          "discordDmDelivery.lastError": { $exists: true, $ne: "" },
        }),
        db.collection("equipment_workshop_requests").countDocuments({
          discordDmOutbox: {
            $elemMatch: {
              availableAt: { $lte: staleBefore },
              sentAt: { $exists: false },
              skippedAt: { $exists: false },
            },
          },
        }),
        db.collection("bureaucrat_votes").countDocuments({
          $or: [
            { "publication.lastError": { $exists: true, $ne: "" } },
            {
              "publication.state": { $in: ["PENDING", "DISPATCHING"] },
              updatedAt: { $lte: staleBefore },
            },
          ],
        }),
        db.collection("scheduled_job_runs")
          .aggregate<{ status: string }>([
            { $sort: { updatedAt: -1 } },
            { $group: { _id: "$jobName", row: { $first: "$$ROOT" } } },
            { $replaceRoot: { newRoot: "$row" } },
            { $match: { status: { $in: ["FAILED", "DEAD"] } } },
            { $project: { status: 1 } },
          ])
          .toArray(),
      ]);
    const enabledConsumers = new Set(this.options.enabledConsumers ?? []);
    const missingConsumers = WORKER_CONSUMER_NAMES.filter(
      (name) => !enabledConsumers.has(name),
    );
    const desired = desiredStates.reduce((sum, count) => sum + count, 0);
    const effectiveDesired = countEffectiveDesiredStateIssues(
      desired,
      deliveryUnknown,
    );
    const issueCount =
      dead +
      retrying +
      overdue +
      expiredLeases +
      effectiveDesired +
      workshopDmErrors +
      workshopDmOverdue +
      missingConsumers.length +
      votePublicationStalls +
      latestScheduledFailures.length;
    if (issueCount === 0) {
      return {
        observedDue: 0,
        failed: 0,
        dead: 0,
        operationalRecovery: true,
      };
    }

    return {
      observedDue: issueCount,
      failed: issueCount,
      dead,
      operationalAlert: buildIntegrationHealthOperationalAlert({
        dead,
        retrying,
        overdue,
        expiredLeases,
        desired: effectiveDesired,
        deliveryUnknown,
        workshopDmErrors,
        workshopDmOverdue,
        missingConsumers,
        votePublicationStalls,
        latestScheduledFailures,
      }),
    };
  }
}
