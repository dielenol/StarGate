const KST_TIMEZONE = "Asia/Seoul";

/**
 * KST display timestamp compatible with legacy stock bot rows.
 * Format: YYYY-MM-DD HH:mm
 */
export function kstNowTag(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = String(Number.parseInt(get("hour") || "0", 10) % 24).padStart(
    2,
    "0",
  );
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
}

export function kstDateTag(date: Date = new Date()): string {
  return kstNowTag(date).slice(0, 10);
}
