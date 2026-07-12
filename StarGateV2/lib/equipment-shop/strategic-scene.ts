const KST_TIME_ZONE = "Asia/Seoul";
const STAFFED_OPEN_HOUR = 8;
const STAFFED_CLOSE_HOUR = 20;
const STAFFED_WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

export type StrategicScene = "staffed" | "quiet";

export const STRATEGIC_SCENE_REFRESH_MS = 60_000;

export const STRATEGIC_SCENE_INFO: Record<
  StrategicScene,
  { tag: string; label: string; detail: string }
> = {
  staffed: {
    tag: "DAY SHIFT",
    label: "주간 정비조 운영 중",
    detail: "평일 08:00–20:00 KST · 자산 점검 및 반출 준비",
  },
  quiet: {
    tag: "QUIET SHIFT",
    label: "비가동 시간대",
    detail: "당직 관제 운영 · 승인 자산은 원격으로 열람 가능",
  },
};

export function getStrategicScene(now: Date = new Date()): StrategicScene {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const isStaffed =
    weekday !== undefined &&
    STAFFED_WEEKDAYS.has(weekday) &&
    Number.isInteger(hour) &&
    hour >= STAFFED_OPEN_HOUR &&
    hour < STAFFED_CLOSE_HOUR;

  return isStaffed ? "staffed" : "quiet";
}
