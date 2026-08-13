export type DateInput = Date | string | null | undefined;

export type DateFormat = "short" | "long" | "numeric" | "padded" | "compact";

const NULL_PLACEHOLDER = "—";
const KST_TIME_ZONE = "Asia/Seoul";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toDate(d: DateInput): Date | null {
  if (d == null) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  // Invalid Date 가 "Invalid Date" 텍스트로 노출되지 않도록 placeholder 로 통일.
  return Number.isNaN(date.getTime()) ? null : date;
}

function toKstDate(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

export function formatDate(d: DateInput, fmt: DateFormat = "short"): string {
  const date = toDate(d);
  if (!date) return NULL_PLACEHOLDER;

  switch (fmt) {
    case "long":
      return date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: KST_TIME_ZONE,
      });
    case "numeric":
      return date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: KST_TIME_ZONE,
      });
    case "padded": {
      const kst = toKstDate(date);
      return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
    }
    case "compact": {
      const kst = toKstDate(date);
      return `${String(kst.getUTCMonth() + 1).padStart(2, "0")}/${String(kst.getUTCDate()).padStart(2, "0")}`;
    }
    case "short":
    default:
      return date.toLocaleDateString("ko-KR", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        timeZone: KST_TIME_ZONE,
      });
  }
}

export function formatTime(d: DateInput): string {
  const date = toDate(d);
  if (!date) return NULL_PLACEHOLDER;
  const kst = toKstDate(date);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

export function formatDateTime(
  d: DateInput,
  dateFmt: DateFormat = "numeric",
): string {
  const date = toDate(d);
  if (!date) return NULL_PLACEHOLDER;
  return `${formatDate(date, dateFmt)} · ${formatTime(date)}`;
}
