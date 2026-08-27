import {
  HONOR_ANALYZER_REVISION,
  reduceOperationHonorSource,
  type HonorAnalysisSource,
} from "@stargate/core";
import {
  completeClaimedHonorAnalysis,
  findHonorCandidateCharactersByCodenames,
  getClient,
  HONOR_MANUAL_REVIEW_REVISION,
  haltExhaustedHonorAnalyses,
  honorAnalysisStatesCol,
  honorRecordsCol,
  listHonorAnalysisStates,
  queueHonorAnalysis,
  claimDueHonorAnalysis,
  releaseHonorAnalysisLease,
  sessionReportVisibilityFilter,
  sessionReportsCol,
  shouldForceHonorAnalysisAfterSourceRecovery,
  skipClaimedHonorAnalysis,
  skipHonorAnalysisSource,
  type HonorAnalysisState,
  type SessionReport,
  type UpsertHonorRecordInput,
} from "@stargate/shared-db";

export interface HonorAnalysisReconcileResult {
  scanned: number;
  queued: number;
  withdrawn: number;
  observedDue: number;
}

export type HonorAnalysisSourceLoad =
  | { kind: "READY"; source: HonorAnalysisSource }
  | { kind: "INELIGIBLE" }
  | { kind: "STALE" };

export interface HonorAnalysisStorePort {
  reconcile(now: Date): Promise<HonorAnalysisReconcileResult>;
  haltExhausted(now: Date): Promise<number>;
  claim(now: Date): Promise<HonorAnalysisState | null>;
  loadSource(state: HonorAnalysisState): Promise<HonorAnalysisSourceLoad>;
  complete(input: {
    state: HonorAnalysisState;
    records: readonly UpsertHonorRecordInput[];
    now: Date;
  }): Promise<boolean>;
  release(input: {
    state: HonorAnalysisState;
    error: unknown;
    now: Date;
  }): Promise<"RETRY" | "SKIPPED" | null>;
  skip(state: HonorAnalysisState, reason: string, now: Date): Promise<boolean>;
}

function isPublicOperationReport(report: SessionReport | null): report is SessionReport {
  return Boolean(
    report &&
      report._id &&
      (report.minRole == null || report.minRole === "U"),
  );
}

/**
 * 같은 원문 hash에 대한 수동 심사 확정은 자동 모델 revision으로 덮지 않는다.
 * 보고서 원문이나 연결 후보가 바뀌어 sourceHash가 달라지면 다시 queue된다.
 */
export function isHonorAnalysisSourceStable(input: {
  state?: HonorAnalysisState;
  source: HonorAnalysisSource;
}): boolean {
  const { state, source } = input;
  if (
    state?.sourceRecordId !== source.sourceRecordId ||
    state.sourceHash !== source.sourceHash
  ) {
    return false;
  }
  if (state.analyzerRevision === HONOR_MANUAL_REVIEW_REVISION) {
    return state.status === "SUCCEEDED";
  }
  return (
    state.analyzerRevision === HONOR_ANALYZER_REVISION &&
    !shouldForceHonorAnalysisAfterSourceRecovery(state)
  );
}

export class SharedDbHonorAnalysisStore implements HonorAnalysisStorePort {
  constructor(
    private readonly options: { leaseMs?: number } = {},
  ) {}

  async reconcile(now: Date): Promise<HonorAnalysisReconcileResult> {
    const [reportHeaders, reports, states, activeSourceKeys] = await Promise.all([
      (await sessionReportsCol())
        .find()
        .project<Pick<SessionReport, "_id" | "sessionId" | "minRole">>({
          _id: 1,
          sessionId: 1,
          minRole: 1,
        })
        .toArray(),
      (await sessionReportsCol())
        .find(sessionReportVisibilityFilter("U"))
        .project<SessionReport>({
          _id: 1,
          sessionId: 1,
          minRole: 1,
          summary: 1,
          highlights: 1,
          relatedPersonnelCodenames: 1,
          updatedAt: 1,
        })
        .toArray(),
      listHonorAnalysisStates(),
      (await honorRecordsCol()).distinct("source.key", {
        domain: "OPERATION",
        "source.type": "SESSION_REPORT",
        status: "ACTIVE",
      }),
    ]);
    const reportByKey = new Map(
      reports.map((report) => [report.sessionId, report]),
    );
    const keys = [
      ...new Set([
        ...reports.map((report) => report.sessionId),
        ...reportHeaders.map((report) => report.sessionId),
        ...states.map((state) => state.sourceKey),
        ...activeSourceKeys,
      ]),
    ].sort();
    const reportHeaderKeys = new Set(
      reportHeaders.map((report) => report.sessionId),
    );
    const stateByKey = new Map(states.map((state) => [state.sourceKey, state]));
    const activeSourceKeySet = new Set(activeSourceKeys);
    const client = await getClient();
    let queued = 0;
    let withdrawn = 0;
    for (const sourceKey of keys) {
      const report = reportByKey.get(sourceKey) ?? null;
      const previous = stateByKey.get(sourceKey);
      if (!isPublicOperationReport(report)) {
        const reason = reportHeaderKeys.has(sourceKey)
          ? "SOURCE_NOT_ELIGIBLE"
          : "SOURCE_DELETED";
        const alreadyStable =
          previous?.status === "SKIPPED" &&
          previous.lastError === reason &&
          !previous.leaseToken &&
          !previous.leaseUntil &&
          !previous.nextAttemptAt;
        if (
          !activeSourceKeySet.has(sourceKey) &&
          (alreadyStable || !previous)
        ) {
          continue;
        }
      } else {
        const characters = await findHonorCandidateCharactersByCodenames(
          report.relatedPersonnelCodenames ?? [],
        );
        const source = reduceOperationHonorSource({ report, characters });
        if (!source) {
          const alreadyStable =
            previous?.status === "SKIPPED" &&
            previous.lastError === "SOURCE_NOT_ANALYZABLE" &&
            !previous.leaseToken &&
            !previous.leaseUntil &&
            !previous.nextAttemptAt;
          if (
            !activeSourceKeySet.has(sourceKey) &&
            (alreadyStable || !previous)
          ) {
            continue;
          }
        } else if (isHonorAnalysisSourceStable({ state: previous, source })) {
          continue;
        }
      }

      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const report = await (await sessionReportsCol()).findOne(
            { sessionId: sourceKey },
            { session },
          );
          if (!isPublicOperationReport(report)) {
            if (
              await skipHonorAnalysisSource({
                sourceKey,
                now,
                reason: report
                  ? "SOURCE_NOT_ELIGIBLE"
                  : "SOURCE_DELETED",
                session,
              })
            ) {
              withdrawn += 1;
            }
            return;
          }
          const characters = await findHonorCandidateCharactersByCodenames(
            report.relatedPersonnelCodenames ?? [],
            { session },
          );
          const source = reduceOperationHonorSource({ report, characters });
          if (!source) {
            if (
              await skipHonorAnalysisSource({
                sourceKey,
                now,
                reason: "SOURCE_NOT_ANALYZABLE",
                session,
              })
            ) {
              withdrawn += 1;
            }
            return;
          }
          const currentState = await (await honorAnalysisStatesCol()).findOne(
            { _id: `session-report:${sourceKey}` },
            { session },
          );
          if (
            isHonorAnalysisSourceStable({
              state: currentState ?? undefined,
              source,
            })
          ) {
            return;
          }
          const result = await queueHonorAnalysis({
            sourceKey,
            sourceRecordId: source.sourceRecordId,
            sourceHash: source.sourceHash,
            analyzerRevision: HONOR_ANALYZER_REVISION,
            now,
            force: shouldForceHonorAnalysisAfterSourceRecovery(currentState),
            session,
          });
          if (result.queued) queued += 1;
        });
      } finally {
        await session.endSession();
      }
    }

    const observedDue = await (await honorAnalysisStatesCol()).countDocuments({
      $or: [
        {
          status: { $in: ["PENDING", "RETRY"] },
          $or: [
            { nextAttemptAt: { $exists: false } },
            { nextAttemptAt: { $lte: now } },
          ],
        },
        { status: "LEASED", leaseUntil: { $lte: now } },
      ],
    });
    return { scanned: keys.length, queued, withdrawn, observedDue };
  }

  haltExhausted(now: Date): Promise<number> {
    return haltExhaustedHonorAnalyses(now);
  }

  claim(now: Date): Promise<HonorAnalysisState | null> {
    return claimDueHonorAnalysis({ now, leaseMs: this.options.leaseMs });
  }

  async loadSource(state: HonorAnalysisState): Promise<HonorAnalysisSourceLoad> {
    const report = await (await sessionReportsCol()).findOne({
      sessionId: state.sourceKey,
    });
    if (!isPublicOperationReport(report)) return { kind: "INELIGIBLE" };
    const characters = await findHonorCandidateCharactersByCodenames(
      report.relatedPersonnelCodenames ?? [],
    );
    const source = reduceOperationHonorSource({ report, characters });
    if (!source) return { kind: "INELIGIBLE" };
    if (
      source.sourceHash !== state.sourceHash ||
      source.sourceRecordId !== state.sourceRecordId ||
      state.analyzerRevision !== HONOR_ANALYZER_REVISION
    ) {
      return { kind: "STALE" };
    }
    return { kind: "READY", source };
  }

  complete(input: {
    state: HonorAnalysisState;
    records: readonly UpsertHonorRecordInput[];
    now: Date;
  }): Promise<boolean> {
    if (!input.state.leaseToken) return Promise.resolve(false);
    return completeClaimedHonorAnalysis({
      id: input.state._id,
      leaseToken: input.state.leaseToken,
      sourceHash: input.state.sourceHash,
      analyzerRevision: input.state.analyzerRevision,
      records: input.records,
      now: input.now,
    });
  }

  release(input: {
    state: HonorAnalysisState;
    error: unknown;
    now: Date;
  }): Promise<"RETRY" | "SKIPPED" | null> {
    if (!input.state.leaseToken) return Promise.resolve(null);
    return releaseHonorAnalysisLease({
      id: input.state._id,
      leaseToken: input.state.leaseToken,
      error: input.error,
      now: input.now,
    });
  }

  skip(
    state: HonorAnalysisState,
    reason: string,
    now: Date,
  ): Promise<boolean> {
    if (!state.leaseToken) return Promise.resolve(false);
    return skipClaimedHonorAnalysis({
      id: state._id,
      sourceKey: state.sourceKey,
      leaseToken: state.leaseToken,
      sourceHash: state.sourceHash,
      analyzerRevision: state.analyzerRevision,
      reason,
      now,
    });
  }
}
