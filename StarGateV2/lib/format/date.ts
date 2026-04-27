export type DateInput = Date | string | null | undefined;

export type DateFormat = "short" | "long" | "numeric" | "padded" | "compact";

const NULL_PLACEHOLDER = "—";

function toDate(d: DateInput): Date | null {
  if (d == null) return null;
  return typeof d === "string" ? new Date(d) : d;
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
      });
    case "numeric":
      return date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    case "padded":
      return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
    case "compact":
      return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    case "short":
    default:
      return date.toLocaleDateString("ko-KR", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      });
  }
}

export function formatTime(d: DateInput): string {
  const date = toDate(d);
  if (!date) return NULL_PLACEHOLDER;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatDateTime(
  d: DateInput,
  dateFmt: DateFormat = "numeric",
): string {
  const date = toDate(d);
  if (!date) return NULL_PLACEHOLDER;
  return `${formatDate(date, dateFmt)} · ${formatTime(date)}`;
}
