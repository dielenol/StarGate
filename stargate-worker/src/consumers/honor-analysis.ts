import {
  HONOR_ANALYZER_REVISION,
  buildOperationHonorRecords,
  validateOperationHonorResults,
} from "@stargate/core";

import type { ConsumerTickResult, DueWorkConsumerPort } from "./port.js";
import type { HonorAnalyzerPort } from "../honor-analysis/ollama.js";
import {
  SharedDbHonorAnalysisStore,
  type HonorAnalysisStorePort,
} from "../honor-analysis/store.js";

const MAX_ANALYSES_PER_TICK = 3;
const HONOR_RECONCILE_INTERVAL_MS = 5 * 60_000;

/** gate OFF 상태에서도 consumer health/readiness를 유지하는 명시적 no-op 경계. */
export class HonorAnalysisActivationGateConsumer
  implements DueWorkConsumerPort
{
  readonly name = "honor-analysis";

  async tick(): Promise<ConsumerTickResult> {
    return { observedDue: 0 };
  }
}

export class HonorAnalysisConsumer implements DueWorkConsumerPort {
  readonly name = "honor-analysis";
  private nextReconcileAt = 0;

  constructor(
    private readonly analyzer: HonorAnalyzerPort,
    private readonly store: HonorAnalysisStorePort =
      new SharedDbHonorAnalysisStore(),
    private readonly options: { reconcileIntervalMs?: number } = {},
  ) {}

  async tick(context: {
    mode: "shadow" | "active";
    signal: AbortSignal;
  }): Promise<ConsumerTickResult> {
    if (context.mode !== "active") return { observedDue: 0 };
    const now = new Date();
    const dead = await this.store.haltExhausted(now);
    const shouldReconcile = now.getTime() >= this.nextReconcileAt;
    const reconciliation = shouldReconcile
      ? await this.store.reconcile(now)
      : { scanned: 0, queued: 0, withdrawn: 0, observedDue: 0 };
    if (shouldReconcile) {
      this.nextReconcileAt =
        now.getTime() +
        Math.max(
          1_000,
          this.options.reconcileIntervalMs ?? HONOR_RECONCILE_INTERVAL_MS,
        );
    }
    let claimed = 0;
    let delivered = 0;
    let failed = 0;

    for (let index = 0; index < MAX_ANALYSES_PER_TICK; index += 1) {
      if (context.signal.aborted) break;
      const state = await this.store.claim(new Date());
      if (!state) break;
      claimed += 1;
      const loaded = await this.store.loadSource(state);
      if (loaded.kind === "STALE") continue;
      if (loaded.kind === "INELIGIBLE") {
        await this.store.skip(state, "SOURCE_NOT_ELIGIBLE", new Date());
        continue;
      }
      try {
        const beforeEgress = async (): Promise<boolean> => {
          const current = await this.store.loadSource(state);
          return (
            current.kind === "READY" &&
            current.source.sourceRecordId === loaded.source.sourceRecordId &&
            current.source.sourceHash === loaded.source.sourceHash
          );
        };
        const { proposal, critique } = await this.analyzer.analyze(
          loaded.source,
          context.signal,
          beforeEgress,
        );
        const honors = validateOperationHonorResults({
          source: loaded.source,
          proposal,
          critique,
        });
        const records = buildOperationHonorRecords({
          source: loaded.source,
          honors,
          analyzerRevision: HONOR_ANALYZER_REVISION,
          issuedAt: new Date(),
        });
        if (
          await this.store.complete({
            state,
            records,
            now: new Date(),
          })
        ) {
          delivered += records.length;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "HONOR_ANALYSIS_SOURCE_EGRESS_STALE"
        ) {
          const current = await this.store.loadSource(state);
          if (current.kind === "INELIGIBLE") {
            await this.store.skip(state, "SOURCE_NOT_ELIGIBLE", new Date());
          } else {
            await this.store.release({ state, error, now: new Date() });
          }
          continue;
        }
        failed += 1;
        await this.store.release({ state, error, now: new Date() });
      }
    }

    return {
      observedDue: Math.max(reconciliation.observedDue, claimed),
      claimed,
      delivered,
      failed,
      dead,
      ...(failed > 0
        ? {
            operationalAlert: {
              fingerprint: "honor-analysis-failed",
              severity: "WARNING" as const,
              summary: "작전 공적 자동 분석 재시도가 발생했습니다.",
            },
          }
        : {}),
    };
  }
}
