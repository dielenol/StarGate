import {
  SCHEDULED_JOB_NAMES,
  isScheduledJobName,
} from "@stargate/core";
import {
  expireStaleScheduledJobRuns,
  findDueScheduledJobRuns,
  type ScheduledJobRun,
} from "@stargate/shared-db";

import { buildScheduledJobSlotKey } from "../jobs/dispatcher.js";
import type { ScheduledJobCoordinatorPort } from "../jobs/port.js";
import type { DueWorkConsumerPort } from "./port.js";

type FindDueScheduledJobRuns = (
  input: Parameters<typeof findDueScheduledJobRuns>[0],
) => Promise<ScheduledJobRun[]>;

type ExpireStaleScheduledJobRuns = (
  input: Parameters<typeof expireStaleScheduledJobRuns>[0],
) => Promise<number>;

interface ScheduledJobRetryConsumerDependencies {
  findDue?: FindDueScheduledJobRuns;
  expireStale?: ExpireStaleScheduledJobRuns;
  now?: () => Date;
  maxBatchSize?: number;
}

export class ScheduledJobRetryConsumer implements DueWorkConsumerPort {
  readonly name = "scheduled-job-retry";

  constructor(
    private readonly coordinator: ScheduledJobCoordinatorPort,
    private readonly dependencies: ScheduledJobRetryConsumerDependencies = {},
  ) {}

  async tick({
    mode,
    signal,
  }: {
    mode: "shadow" | "active";
    signal: AbortSignal;
  }) {
    const summary = {
      observedDue: 0,
      claimed: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
    };
    if (mode !== "active" || signal.aborted) return summary;

    const now = this.dependencies.now?.() ?? new Date();
    const currentDailySlotKey = buildScheduledJobSlotKey(
      "shop.refresh",
      now,
    );
    const currentStockSlotKey = buildScheduledJobSlotKey("stocks.tick", now);
    const jobNames = [...SCHEDULED_JOB_NAMES];
    const expire = this.dependencies.expireStale ?? expireStaleScheduledJobRuns;
    summary.dead = await expire({
      now,
      currentSlotKey: currentDailySlotKey,
      jobNames: jobNames.filter((jobName) => jobName !== "stocks.tick"),
    });
    summary.dead += await expire({
      now,
      currentSlotKey: currentStockSlotKey,
      jobNames: ["stocks.tick"],
    });
    const runs = await (
      this.dependencies.findDue ?? findDueScheduledJobRuns
    )({
      now,
      limit:
        this.dependencies.maxBatchSize ?? SCHEDULED_JOB_NAMES.length,
      jobNames,
    });
    const errors: unknown[] = [];
    summary.observedDue = runs.length;

    for (const run of runs) {
      if (signal.aborted) break;
      if (!isScheduledJobName(run.jobName)) continue;
      const expectedSlotKey = run.jobName === "stocks.tick"
        ? currentStockSlotKey
        : currentDailySlotKey;
      if (run.slotKey !== expectedSlotKey) continue;

      try {
        const result = await this.coordinator.executeOnce({
          jobName: run.jobName,
          slotKey: run.slotKey,
          requestedAt:
            run.jobName === "sessions.erp-reminders" ||
            run.jobName === "stocks.tick" ||
            run.jobName === "research.daily-ranking"
              ? now
              : run.startedAt,
          mode: "active",
        });
        if (result.outcome === "SUCCEEDED") {
          summary.claimed += 1;
          summary.succeeded += 1;
        }
      } catch (error) {
        summary.claimed += 1;
        summary.failed += 1;
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `예약 작업 재시도 ${errors.length}건이 실패했습니다.`,
      );
    }

    return summary;
  }
}
