/** KST 기준 사고 대응 일정. endsAt은 다음 안내 시각이며 자동 해제 시각이 아니다. */
export const ERP_MAINTENANCE_WINDOW = {
  startsAt: "2026-10-25T20:00:00+09:00",
  endsAt: "2026-10-26T12:00:00+09:00",
} as const;

export type MaintenanceState = {
  phase: "off" | "scheduled" | "active";
  startsAt: string | null;
  /** 기존 클라이언트 호환 필드. 이 시각 이후에도 active를 유지한다. */
  endsAt: string | null;
  serverNow: number;
  scope: "site";
  resumePolicy: "manual";
};

type MaintenanceEnvironment = {
  [key: string]: string | undefined;
  ERP_MAINTENANCE_DISABLED?: string;
  ERP_MAINTENANCE_START_AT?: string;
  ERP_MAINTENANCE_END_AT?: string;
};

const EXPLICIT_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidTimestamp(value: string): boolean {
  if (!EXPLICIT_TIMEZONE.test(value) || !Number.isFinite(Date.parse(value))) return false;
  // 오프셋을 제외한 날짜도 round-trip하여 2월 30일 같은 자동 보정을 거부한다.
  const localDate = new Date(value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "Z"));
  return Number.isFinite(localDate.getTime()) && localDate.toISOString().slice(0, 10) === value.slice(0, 10);
}

export function getMaintenanceState(
  env: MaintenanceEnvironment = process.env,
  now = Date.now(),
): MaintenanceState {
  const policy = { scope: "site" as const, resumePolicy: "manual" as const, serverNow: now };
  // 운영자의 명시적인 해제만 허용한다. 날짜 경과는 해제 조건이 아니다.
  if (env.ERP_MAINTENANCE_DISABLED === "1") {
    return { ...policy, startsAt: null, endsAt: null, phase: "off" };
  }

  let startsAt: string = ERP_MAINTENANCE_WINDOW.startsAt;
  let endsAt: string = ERP_MAINTENANCE_WINDOW.endsAt;
  const overrideStart = env.ERP_MAINTENANCE_START_AT;
  const overrideEnd = env.ERP_MAINTENANCE_END_AT;
  // 운영에서는 과거 시험 일정이나 미래 시작 override로 봉쇄를 미룰 수 없다.
  const allowTestWindow = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  if (allowTestWindow && overrideStart && overrideEnd && isValidTimestamp(overrideStart) && isValidTimestamp(overrideEnd)) {
    const start = Date.parse(overrideStart);
    const end = Date.parse(overrideEnd);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      startsAt = overrideStart;
      endsAt = overrideEnd;
    }
  }
  return { ...policy, startsAt, endsAt, phase: now < Date.parse(startsAt) ? "scheduled" : "active" };
}

export function isErpPath(pathname: string): boolean {
  return pathname === "/erp" || pathname.startsWith("/erp/");
}

export function isErpApiPath(pathname: string): boolean {
  return pathname === "/api/erp" || pathname.startsWith("/api/erp/");
}

/** 안내 화면과 그 화면을 표시하는 정적 파일만 허용한다. 확장자만으로 우회하지 않는다. */
export function isMaintenanceResource(pathname: string, nodeEnv: string | undefined): boolean {
  return pathname === "/maintenance" || pathname === "/api/maintenance" ||
    pathname.startsWith("/_next/static/") ||
    ["/assets/StarGate_logo_watermark.webp", "/assets/favicon.ico", "/favicon.ico"].includes(pathname) ||
    (nodeEnv === "development" && (pathname === "/maintenance/preview" || pathname.startsWith("/_next/")));
}

/** 재개 약속이 아닌 상태 재확인 간격. 장기 봉쇄 중에도 일정하다. */
export function maintenanceRetryAfter(): string {
  return "3600";
}
