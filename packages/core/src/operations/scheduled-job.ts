export const SCHEDULED_JOB_NAMES = [
  "shop.refresh",
  "stocks.tick",
  "credits.daily-allowance",
  "sessions.erp-reminders",
  "research.daily-ranking",
] as const;

export type ScheduledJobName = (typeof SCHEDULED_JOB_NAMES)[number];

const SCHEDULED_JOB_NAME_SET = new Set<string>(SCHEDULED_JOB_NAMES);

export function isScheduledJobName(value: unknown): value is ScheduledJobName {
  return typeof value === "string" && SCHEDULED_JOB_NAME_SET.has(value);
}

export interface ScheduledJobExecutionContext {
  jobName: ScheduledJobName;
  slotKey: string;
  requestedAt: Date;
  mode: "shadow" | "active";
}

export interface ScheduledJobExecutionResult {
  jobName: ScheduledJobName;
  slotKey: string;
  outcome: "SHADOW" | "SUCCEEDED" | "SKIPPED";
  summary: Record<string, number | string | boolean | null>;
}
