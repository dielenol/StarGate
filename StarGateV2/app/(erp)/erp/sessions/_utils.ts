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

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateMD(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
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
  const t = new Date(targetIso);
  const a = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}

export function ddayLabel(targetIso: string): string {
  const d = diffDays(targetIso);
  if (d === 0) return "TODAY";
  if (d > 0) return `D-${d}`;
  return `D+${-d}`;
}

export function ddayTone(targetIso: string): "" | "urgent" | "past" {
  const d = diffDays(targetIso);
  if (d < 0) return "past";
  if (d <= 2) return "urgent";
  return "";
}

export function isAttending(s: SerializedSession): boolean {
  return s.myRsvp === "YES" && s.status !== "CANCELED";
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
