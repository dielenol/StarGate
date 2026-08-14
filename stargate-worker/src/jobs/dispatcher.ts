import {
  isScheduledJobName,
  type ScheduledJobExecutionContext,
  type ScheduledJobExecutionResult,
  type ScheduledJobName,
} from "@stargate/core";
import { latestDueNovexSlot, novexKstDate, novexSlotKey } from "@stargate/core/domain/novex-market";

import type { WorkerMode } from "../config.js";
import type { ScheduledJobCoordinatorPort } from "./port.js";

export class UnknownScheduledJobError extends Error {
  constructor(jobName: string) {
    super(`지원하지 않는 예약 작업입니다: ${jobName}`);
    this.name = "UnknownScheduledJobError";
  }
}

export class ActiveJobAdapterUnavailableError extends Error {
  constructor() {
    super(
      "active scheduled job adapter가 아직 연결되지 않았습니다. shared-db run/lease와 도메인 operation을 먼저 wiring하세요.",
    );
    this.name = "ActiveJobAdapterUnavailableError";
  }
}

function kstDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function kstMinuteKey(date: Date): string {
  const due = latestDueNovexSlot(date);
  if (due) return due;
  const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return novexSlotKey(novexKstDate(yesterday), 23);
}

export function buildScheduledJobSlotKey(
  jobName: ScheduledJobName,
  requestedAt: Date,
): string {
  return jobName === "stocks.tick"
    ? kstMinuteKey(requestedAt)
    : kstDateKey(requestedAt);
}

export function parseScheduledJobName(value: string): ScheduledJobName {
  if (!isScheduledJobName(value)) {
    throw new UnknownScheduledJobError(value);
  }
  return value;
}

export class ScheduledJobDispatcher {
  constructor(
    private readonly mode: WorkerMode,
    private readonly coordinator?: ScheduledJobCoordinatorPort,
  ) {}

  async dispatch(
    jobName: ScheduledJobName,
    requestedAt = new Date(),
  ): Promise<ScheduledJobExecutionResult> {
    const context: ScheduledJobExecutionContext = {
      jobName,
      requestedAt,
      mode: this.mode,
      slotKey: buildScheduledJobSlotKey(jobName, requestedAt),
    };

    if (this.mode === "shadow") {
      return {
        jobName,
        slotKey: context.slotKey,
        outcome: "SHADOW",
        summary: {
          claimed: 0,
          mutated: false,
          externalDeliveries: 0,
        },
      };
    }
    if (!this.coordinator) throw new ActiveJobAdapterUnavailableError();
    return this.coordinator.executeOnce(context);
  }
}
