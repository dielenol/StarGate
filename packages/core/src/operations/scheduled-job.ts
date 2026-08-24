import { kstDateTag, kstNowTag } from "../domain/kst-time.js";

export const SCHEDULED_JOB_NAMES = [
  "shop.refresh",
  "stocks.tick",
  "credits.daily-allowance",
  "sessions.erp-reminders",
  "research.daily-ranking",
] as const;

export type ScheduledJobName = (typeof SCHEDULED_JOB_NAMES)[number];

export const RESEARCH_DAILY_RANKING_GRACE_MINUTES = 15;

export function expectedResearchDailyRankingSlot(
  now: Date = new Date(),
  graceMinutes = RESEARCH_DAILY_RANKING_GRACE_MINUTES,
): string {
  const kstTag = kstNowTag(now);
  const [hour, minute] = kstTag
    .slice(11)
    .split(":")
    .map((value) => Number.parseInt(value, 10));
  const currentMinute = hour * 60 + minute;
  const dueMinute = 21 * 60 + graceMinutes;

  return currentMinute >= dueMinute
    ? kstTag.slice(0, 10)
    : kstDateTag(new Date(now.getTime() - 24 * 60 * 60 * 1_000));
}

export function isResearchDailyRankingCadenceOverdue(
  latestSlotKey: string | null | undefined,
  now: Date = new Date(),
  graceMinutes = RESEARCH_DAILY_RANKING_GRACE_MINUTES,
): boolean {
  const expectedSlotKey = expectedResearchDailyRankingSlot(now, graceMinutes);
  return !latestSlotKey || latestSlotKey < expectedSlotKey;
}

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
