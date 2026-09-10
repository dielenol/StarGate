import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";
import type { SessionStatus } from "@/types/session";

export const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const DOW_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export const STATUS_LABEL: Record<SessionStatus, string> = {
  OPEN: "모집중",
  CLOSING: "마감 임박",
  CLOSED: "확정",
  CANCELING: "취소 예정",
  CANCELED: "취소됨",
};

export type StatusGroup = "ALL" | "open" | "closed" | "cancel" | "mine";

export type StatusMod = "" | "closing" | "closed" | "cancel";

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 세션의 표시 날짜와 자정 경계는 서버·브라우저의 시간대와 무관하게 KST다.
function toKstDate(value: string | Date): Date {
  return new Date(new Date(value).getTime() + KST_OFFSET_MS);
}

export function sessionDateParts(value: string | Date) {
  const d = toKstDate(value);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}

export function sessionDateKey(value: string | Date): string {
  const { year, month, day } = sessionDateParts(value);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function sessionDayStart(value: string | Date = new Date()): number {
  return Math.floor((new Date(value).getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
}

export function buildCalendarGrid(year: number, month: number) {
  // 달력 셀은 시각이 없는 날짜다. UTC 연산으로 호스트 시간대/DST 영향을 제거한다.
  const startDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const d = new Date(Date.UTC(year, month - 1, 1 - startDow + index));
    return {
      key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
    };
  });
  return cells.slice(35).every((cell) => !cell.inMonth) ? cells.slice(0, 35) : cells;
}

export function formatTime(iso: string): string {
  const d = toKstDate(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatDateMD(iso: string): string {
  const { month, day } = sessionDateParts(iso);
  return `${pad(month)}.${pad(day)}`;
}

export function formatDuration(targetIso: string, closeIso: string): string {
  const start = new Date(targetIso).getTime();
  const close = new Date(closeIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(close)) return "";
  const diff = close - start;
  if (diff <= 0) return "";
  const hours = Math.round(diff / (60 * 60 * 1000));
  return hours > 0 ? `${hours}h` : "";
}

export function diffDays(targetIso: string, now = new Date()): number {
  return (sessionDayStart(targetIso) - sessionDayStart(now)) / DAY_MS;
}

export function ddayLabel(targetIso: string, now: Date): string {
  const d = diffDays(targetIso, now);
  if (d === 0) return "TODAY";
  if (d > 0) return `D-${d}`;
  return `D+${-d}`;
}

export function ddayTone(targetIso: string, now: Date): "" | "urgent" | "past" {
  const d = diffDays(targetIso, now);
  if (d < 0) return "past";
  if (d <= 2) return "urgent";
  return "";
}

export function isAttending(s: SerializedSession): boolean {
  return s.myRsvp === "YES" && s.status !== "CANCELED";
}

export function statusModifier(status: SessionStatus): StatusMod {
  if (status === "OPEN") return "";
  if (status === "CLOSING") return "closing";
  if (status === "CLOSED") return "closed";
  return "cancel";
}

export function inGroup(s: SerializedSession, group: StatusGroup): boolean {
  switch (group) {
    case "ALL":
      return true;
    case "open":
      return s.status === "OPEN" || s.status === "CLOSING";
    case "closed":
      return s.status === "CLOSED";
    case "cancel":
      return s.status === "CANCELING" || s.status === "CANCELED";
    case "mine":
      return isAttending(s);
  }
}

export function matchesQuery(s: SerializedSession, q: string): boolean {
  if (!q) return true;
  if (s.title.toLowerCase().includes(q)) return true;
  for (const p of s.participants) {
    if (p.displayName.toLowerCase().includes(q)) return true;
    if (p.codename && p.codename.toLowerCase().includes(q)) return true;
  }
  return false;
}

export function buildDiscordLink(opts: {
  guildId: string;
  channelId: string;
  messageId?: string;
}): string {
  const { guildId, channelId, messageId } = opts;
  if (messageId && messageId.trim().length > 0) {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
  }
  return `https://discord.com/channels/${guildId}/${channelId}`;
}
