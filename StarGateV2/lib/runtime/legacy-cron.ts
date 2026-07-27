const DISABLED_VALUES = new Set(["0", "false", "off"]);

/**
 * Legacy Vercel cron ownership switch.
 *
 * Undefined values intentionally preserve the pre-cutover behavior. During
 * cutover, each job can be disabled independently without changing the shared
 * Vercel schedule entrypoint.
 */
export function isLegacyCronJobEnabled(value: string | undefined): boolean {
  if (value === undefined) return true;
  return !DISABLED_VALUES.has(value.trim().toLowerCase());
}
