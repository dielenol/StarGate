import type { SessionStatus } from "./session";

export type DashboardSessionSource = "registra" | "trpg";

/** 대시보드에서 세션을 식별하고 정확한 원본으로 이동하는 최소 공개 DTO. */
export interface DashboardSessionLink {
  _id: string;
  title: string;
  targetDateTime: string;
  status: SessionStatus;
  guildId: string;
  channelId: string;
  messageId: string;
  source: DashboardSessionSource;
  href: string;
  externalHref: string | null;
  externalLabel: string | null;
}

export interface DashboardRegistraSessionCandidate {
  _id: string;
  title: string;
  targetDateTime: Date;
  status: SessionStatus;
  guildId: string;
  channelId: string;
  messageId: string;
}

export interface DashboardTrpgSessionCandidate {
  _id: string;
  title: string;
  targetDateTime: Date;
  guildId: string;
}

export interface DashboardRegistraSourceResult {
  sessions: DashboardRegistraSessionCandidate[];
  responseBySessionId: ReadonlyMap<string, "YES" | "NO">;
}

export interface DashboardSessionOverview {
  myRsvpUpcoming: DashboardSessionLink[];
  pendingResponse: DashboardSessionLink[];
  pendingResponseCount: number;
  unavailableSources: DashboardSessionSource[];
}

export interface DashboardSessionOverviewCandidates {
  registra: DashboardRegistraSourceResult | null;
  trpg: DashboardTrpgSessionCandidate[] | null;
  trpgEnabled: boolean;
  trpgWebBaseUrl: string | null;
  now: Date;
}

export interface DashboardSessionTarget {
  sessionId: string;
  source: DashboardSessionSource;
  date: string;
  year: number;
  month: number;
}

export interface DashboardSessionSearchParams {
  sessionId?: string | string[];
  source?: string | string[];
  date?: string | string[];
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const KST_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const UPCOMING_PREVIEW_LIMIT = 3;
const PENDING_PREVIEW_LIMIT = 5;

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export function toKstDateString(value: Date | string): string | null {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function buildDashboardSessionIdentity(
  source: DashboardSessionSource,
  sessionId: string,
): string {
  return `${source}:${sessionId}`;
}

export function buildDashboardSessionHref(input: {
  sessionId: string;
  source: DashboardSessionSource;
  targetDateTime: Date | string;
}): string {
  const date = toKstDateString(input.targetDateTime);
  if (!date) return "/erp/sessions";
  const params = new URLSearchParams({
    sessionId: input.sessionId,
    source: input.source,
    date,
  });
  return `/erp/sessions?${params.toString()}`;
}

function buildDiscordMessageHref(
  session: DashboardRegistraSessionCandidate,
): string | null {
  if (!session.guildId || !session.channelId) return null;
  const base = `https://discord.com/channels/${encodeURIComponent(session.guildId)}/${encodeURIComponent(session.channelId)}`;
  return session.messageId
    ? `${base}/${encodeURIComponent(session.messageId)}`
    : base;
}

function buildTrpgCalendarHref(baseUrl: string | null): string | null {
  if (!baseUrl) return null;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return `${baseUrl}/calendar`;
  } catch {
    return null;
  }
}

function toLink(
  session:
    | DashboardRegistraSessionCandidate
    | DashboardTrpgSessionCandidate,
  source: DashboardSessionSource,
  externalHref: string | null,
): DashboardSessionLink {
  const targetDateTime = session.targetDateTime.toISOString();
  const isRegistra = source === "registra";
  return {
    _id: session._id,
    title: session.title,
    targetDateTime,
    status: isRegistra
      ? (session as DashboardRegistraSessionCandidate).status
      : "OPEN",
    guildId: session.guildId,
    channelId: isRegistra
      ? (session as DashboardRegistraSessionCandidate).channelId
      : "",
    messageId: isRegistra
      ? (session as DashboardRegistraSessionCandidate).messageId
      : "",
    source,
    href: buildDashboardSessionHref({
      sessionId: session._id,
      source,
      targetDateTime,
    }),
    externalHref,
    externalLabel: externalHref
      ? isRegistra
        ? "Discord 공지 열기"
        : "TRPG 캘린더 열기"
      : null,
  };
}

function compareLinks(a: DashboardSessionLink, b: DashboardSessionLink): number {
  const time = a.targetDateTime.localeCompare(b.targetDateTime);
  if (time !== 0) return time;
  const source = a.source.localeCompare(b.source);
  return source !== 0 ? source : a._id.localeCompare(b._id);
}

/** DB 의존성 없는 최종 선택기. 테스트와 실제 조회가 같은 필터/정렬을 사용한다. */
export function selectDashboardSessionOverview(
  input: DashboardSessionOverviewCandidates,
): DashboardSessionOverview {
  const unavailableSources: DashboardSessionSource[] = [];
  if (input.registra === null) unavailableSources.push("registra");
  if (input.trpgEnabled && input.trpg === null) unavailableSources.push("trpg");

  const nowTime = input.now.getTime();
  const registraSessions = input.registra?.sessions ?? [];
  const responseBySessionId = input.registra?.responseBySessionId ?? new Map();

  const myRegistra = registraSessions
    .filter(
      (session) =>
        session.targetDateTime.getTime() >= nowTime &&
        session.status !== "CANCELED" &&
        responseBySessionId.get(session._id) === "YES",
    )
    .map((session) =>
      toLink(session, "registra", buildDiscordMessageHref(session)),
    );

  const trpgExternalHref = buildTrpgCalendarHref(input.trpgWebBaseUrl);
  const myTrpg = (input.trpg ?? [])
    .filter((session) => session.targetDateTime.getTime() >= nowTime)
    .map((session) => toLink(session, "trpg", trpgExternalHref));

  const pending = registraSessions
    .filter(
      (session) =>
        session.targetDateTime.getTime() >= nowTime &&
        (session.status === "OPEN" || session.status === "CLOSING") &&
        !responseBySessionId.has(session._id),
    )
    .map((session) =>
      toLink(session, "registra", buildDiscordMessageHref(session)),
    )
    .sort(compareLinks);

  return {
    myRsvpUpcoming: [...myRegistra, ...myTrpg]
      .sort(compareLinks)
      .slice(0, UPCOMING_PREVIEW_LIMIT),
    pendingResponse: pending.slice(0, PENDING_PREVIEW_LIMIT),
    pendingResponseCount: pending.length,
    unavailableSources,
  };
}

/**
 * 대시보드 세션 링크의 서버/클라이언트 공용 파서.
 * source, ObjectId, 실제 존재하는 KST 날짜가 모두 유효할 때만 target을 반환한다.
 */
export function parseDashboardSessionTarget(
  input: DashboardSessionSearchParams,
): DashboardSessionTarget | null {
  const sessionId = single(input.sessionId);
  const source = single(input.source);
  const date = single(input.date);
  if (
    !sessionId ||
    !OBJECT_ID_PATTERN.test(sessionId) ||
    (source !== "registra" && source !== "trpg") ||
    !date
  ) {
    return null;
  }

  const match = KST_DATE_PATTERN.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (
    Number.isNaN(parsed.getTime()) ||
    toKstDateString(parsed) !== date ||
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return { sessionId: sessionId.toLowerCase(), source, date, year, month };
}

export function parseDashboardSessionTargetFromUrlSearchParams(
  input: Pick<URLSearchParams, "get">,
): DashboardSessionTarget | null {
  return parseDashboardSessionTarget({
    sessionId: input.get("sessionId") ?? undefined,
    source: input.get("source") ?? undefined,
    date: input.get("date") ?? undefined,
  });
}
