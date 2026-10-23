/** KST 기준 세션 연출 일정. 종료 뒤에는 자동으로 기존 ERP를 제공한다. */
export const ERP_MAINTENANCE_WINDOW = {
  startsAt: "2026-10-25T20:00:00+09:00",
  endsAt: "2026-10-26T12:00:00+09:00",
} as const;

export type MaintenanceState = {
  phase: "off" | "invalid" | "scheduled" | "active" | "ended";
  startsAt: string | null;
  endsAt: string | null;
  serverNow: number;
};

type MaintenanceEnvironment = {
  [key: string]: string | undefined;
  ERP_MAINTENANCE_DISABLED?: string;
  ERP_MAINTENANCE_START_AT?: string;
  ERP_MAINTENANCE_END_AT?: string;
};

const EXPLICIT_TIMEZONE = /T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function getMaintenanceState(
  env: MaintenanceEnvironment = process.env,
  now = Date.now(),
): MaintenanceState {
  const inactive = { startsAt: null, endsAt: null, serverNow: now };
  if (env.ERP_MAINTENANCE_DISABLED === "1") {
    return { ...inactive, phase: "off" };
  }

  // 로컬 시험 일정은 환경변수로만 덮어쓴다. 부분 설정을 기본 일정과 혼합하지 않는다.
  const overridden = env.ERP_MAINTENANCE_START_AT !== undefined ||
    env.ERP_MAINTENANCE_END_AT !== undefined;
  const startsAt = overridden ? env.ERP_MAINTENANCE_START_AT : ERP_MAINTENANCE_WINDOW.startsAt;
  const endsAt = overridden ? env.ERP_MAINTENANCE_END_AT : ERP_MAINTENANCE_WINDOW.endsAt;
  if (!startsAt || !endsAt || !EXPLICIT_TIMEZONE.test(startsAt) || !EXPLICIT_TIMEZONE.test(endsAt)) {
    return { ...inactive, phase: "invalid" };
  }
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { ...inactive, phase: "invalid" };
  }
  return {
    phase: now < start ? "scheduled" : now < end ? "active" : "ended",
    startsAt,
    endsAt,
    serverNow: now,
  };
}

export function isErpPath(pathname: string): boolean {
  return pathname === "/erp" || pathname.startsWith("/erp/");
}

export function isErpApiPath(pathname: string): boolean {
  return pathname === "/api/erp" || pathname.startsWith("/api/erp/");
}

export function maintenanceRetryAfter(state: MaintenanceState): string {
  return String(Math.max(1, Math.ceil(((state.endsAt ? Date.parse(state.endsAt) : state.serverNow) - state.serverNow) / 1000)));
}
