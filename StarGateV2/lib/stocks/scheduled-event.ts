import { kstDateTag } from "@stargate/core/domain/kst-time";

export const STOCK_SCHEDULED_EVENT_MIN_CHANGE_PERCENT = -99;
export const STOCK_SCHEDULED_EVENT_MAX_CHANGE_PERCENT = 400;
export const STOCK_SCHEDULED_EVENT_TEXT_MAX_LENGTH = 80;

const KST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveStockScheduledEventExecuteAt(
  kstDate: string,
): Date | null {
  if (!KST_DATE_PATTERN.test(kstDate)) return null;
  const executeAt = new Date(`${kstDate}T12:00:00+09:00`);
  if (!Number.isFinite(executeAt.getTime())) return null;
  return kstDateTag(executeAt) === kstDate ? executeAt : null;
}
export function normalizeStockScheduledEventChangePercent(
  value: number,
): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getNextStockScheduledEventDate(now = new Date()): string {
  const today = kstDateTag(now);
  const todayExecuteAt = resolveStockScheduledEventExecuteAt(today);
  if (!todayExecuteAt) throw new Error("KST_DATE_RESOLUTION_FAILED");
  if (now.getTime() < todayExecuteAt.getTime()) return today;
  return kstDateTag(new Date(todayExecuteAt.getTime() + DAY_MS));
}
