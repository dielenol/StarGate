import {
  HONOR_ANALYZER_REVISION,
  reduceOperationHonorSource,
  type HonorAnalysisSource,
} from "@stargate/core";
import {
  completeClaimedHonorAnalysis,
  findHonorCandidateCharactersByCodenames,
  getClient,
  haltExhaustedHonorAnalyses,
  honorAnalysisStatesCol,
  listHonorAnalysisStates,
  queueHonorAnalysis,
  claimDueHonorAnalysis,
  releaseHonorAnalysisLease,
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

export class SharedDbHonorAnalysisStore implements HonorAnalysisStorePort {
  constructor(
    private readonly options: { leaseMs?: number } = {},
  ) {}

  async reconcile(now: Date): Promise<HonorAnalysisReconcileResult> {
    const [reportKeys, states] = await Promise.all([
      (await sessionReportsCol())
        .find()
        .project<{ sessionId: string }>({ _id: 0, sessionId: 1 })
        .toArray(),
      listHonorAnalysisStates(),
    ]);
    const keys = [
      ...new Set([
        ...reportKeys.map((report) => report.sessionId),
        ...states.map((state) => state.sourceKey),
      ]),
    ].sort();
    const stateByKey = new Map(states.map((state) => [state.sourceKey, state]));
    const client = await getClient();
    let queued = 0;
    let withdrawn = 0;
    for (const sourceKey of keys) {
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
          const previous = stateByKey.get(sourceKey);
          const result = await queueHonorAnalysis({
            sourceKey,
            sourceRecordId: source.sourceRecordId,
            sourceHash: source.sourceHash,
            analyzerRevision: HONOR_ANALYZER_REVISION,
            now,
            force: shouldForceHonorAnalysisAfterSourceRecovery(previous),
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
