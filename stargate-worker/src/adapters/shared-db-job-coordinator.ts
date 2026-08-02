import type {
  ScheduledJobExecutionContext,
  ScheduledJobExecutionResult,
} from "@stargate/core";
import {
  claimScheduledJobRun,
  completeScheduledJobRun,
  failScheduledJobRun,
  renewScheduledJobRunLease,
} from "@stargate/shared-db";

import type { ScheduledJobHandlerRegistry } from "../jobs/handler-registry.js";
import type { ScheduledJobCoordinatorPort } from "../jobs/port.js";

const DEFAULT_LEASE_MS = 10 * 60 * 1000;

export class ScheduledJobLeaseLostError extends Error {
  constructor(jobName: string, slotKey: string) {
    super(`예약 작업 완료 전에 lease를 상실했습니다: ${jobName}/${slotKey}`);
    this.name = "ScheduledJobLeaseLostError";
  }
}

export interface ScheduledJobRunPersistencePort {
  claim(
    input: Parameters<typeof claimScheduledJobRun>[0],
  ): ReturnType<typeof claimScheduledJobRun>;
  renew(
    input: Parameters<typeof renewScheduledJobRunLease>[0],
  ): ReturnType<typeof renewScheduledJobRunLease>;
  complete(
    input: Parameters<typeof completeScheduledJobRun>[0],
  ): ReturnType<typeof completeScheduledJobRun>;
  fail(
    input: Parameters<typeof failScheduledJobRun>[0],
  ): ReturnType<typeof failScheduledJobRun>;
}

const SHARED_DB_PERSISTENCE: ScheduledJobRunPersistencePort = {
  claim: claimScheduledJobRun,
  renew: renewScheduledJobRunLease,
  complete: completeScheduledJobRun,
  fail: failScheduledJobRun,
};

export class SharedDbScheduledJobCoordinator
  implements ScheduledJobCoordinatorPort
{
  constructor(
    private readonly handlers: ScheduledJobHandlerRegistry,
    private readonly options: {
      leaseMs?: number;
      leaseRenewIntervalMs?: number;
      maxAttempts?: number;
      backoffBaseMs?: number;
      now?: () => Date;
    } = {},
    private readonly persistence: ScheduledJobRunPersistencePort =
      SHARED_DB_PERSISTENCE,
  ) {}

  async executeOnce(
    context: ScheduledJobExecutionContext,
  ): Promise<ScheduledJobExecutionResult> {
    const handler = this.handlers.require(context.jobName);
    const now = this.options.now ?? (() => new Date());
    const leaseMs = this.options.leaseMs ?? DEFAULT_LEASE_MS;
    const leaseRenewIntervalMs =
      this.options.leaseRenewIntervalMs ??
      Math.max(1_000, Math.floor(leaseMs / 3));
    if (
      !Number.isSafeInteger(leaseMs) ||
      leaseMs <= 0 ||
      !Number.isSafeInteger(leaseRenewIntervalMs) ||
      leaseRenewIntervalMs <= 0 ||
      leaseRenewIntervalMs >= leaseMs
    ) {
      throw new Error(
        "scheduled job lease와 갱신 주기는 양수이며 갱신 주기가 lease보다 짧아야 합니다.",
      );
    }

    const run = await this.persistence.claim({
      jobName: context.jobName,
      slotKey: context.slotKey,
      now: now(),
      requestedAt: context.requestedAt,
      leaseMs,
      maxAttempts: this.options.maxAttempts,
    });
    if (!run) {
      return {
        jobName: context.jobName,
        slotKey: context.slotKey,
        outcome: "SKIPPED",
        summary: { reason: "slot-already-owned" },
      };
    }
    if (!run._id || !run.leaseToken) {
      throw new Error("claim된 scheduled_job_run에 ID 또는 leaseToken이 없습니다.");
    }

    const controller = new AbortController();
    let stopped = false;
    let timer: NodeJS.Timeout | null = null;
    let renewalFailure: unknown = null;
    let renewalInFlight: Promise<void> = Promise.resolve();

    const scheduleRenewal = () => {
      timer = setTimeout(() => {
        renewalInFlight = (async () => {
          try {
            const renewedUntil = await this.persistence.renew({
              id: run._id!,
              leaseToken: run.leaseToken!,
              now: now(),
              leaseMs,
            });
            if (!renewedUntil) {
              throw new ScheduledJobLeaseLostError(
                context.jobName,
                context.slotKey,
              );
            }
          } catch (error) {
            renewalFailure = error;
            stopped = true;
            controller.abort(error);
          }
          if (!stopped) scheduleRenewal();
        })();
      }, leaseRenewIntervalMs);
      timer.unref();
    };
    const stopRenewal = async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await renewalInFlight;
    };

    scheduleRenewal();
    try {
      const summary = await handler.execute({
        ...context,
        signal: controller.signal,
      });
      await stopRenewal();
      if (renewalFailure) throw renewalFailure;

      const completed = await this.persistence.complete({
        id: run._id,
        leaseToken: run.leaseToken,
        summary,
        now: now(),
      });
      if (!completed) {
        throw new ScheduledJobLeaseLostError(
          context.jobName,
          context.slotKey,
        );
      }
      return {
        jobName: context.jobName,
        slotKey: context.slotKey,
        outcome: "SUCCEEDED",
        summary,
      };
    } catch (error) {
      await stopRenewal();
      controller.abort(error);
      await this.persistence.fail({
        id: run._id,
        leaseToken: run.leaseToken,
        error,
        attempts: run.attempts,
        maxAttempts: this.options.maxAttempts,
        backoffBaseMs: this.options.backoffBaseMs,
        now: now(),
      });
      throw error;
    }
  }
}
