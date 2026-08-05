import { z } from "zod";

import {
  GOOGLE_CALENDAR_SCOPES,
  type GoogleCalendarConfig,
} from "./config";
import {
  GoogleCalendarReconnectRequiredError,
  GoogleCalendarUpstreamError,
} from "./errors";
import type { GoogleCalendarRawEvent } from "./events";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_CALENDAR_API_BASE =
  "https://www.googleapis.com/calendar/v3";
const MAX_PAGE_COUNT = 20;
const GOOGLE_REQUEST_TIMEOUT_MS = 15_000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

const tokenErrorSchema = z.object({ error: z.string().optional() });

const eventDateTimeSchema = z.object({
  date: z.string().optional(),
  dateTime: z.string().optional(),
});

const calendarEventSchema = z.object({
  id: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  htmlLink: z.string().optional(),
  start: eventDateTimeSchema.optional(),
  end: eventDateTimeSchema.optional(),
});

const calendarListResponseSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        summary: z.string().optional(),
        summaryOverride: z.string().optional(),
        backgroundColor: z.string().optional(),
        primary: z.boolean().optional(),
        deleted: z.boolean().optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

const eventsResponseSchema = z.object({
  items: z.array(calendarEventSchema).optional(),
  nextPageToken: z.string().optional(),
});

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: number;
  grantedScopes: string[];
}

export interface GoogleCalendarListItem {
  id: string;
  name: string;
  color: string | undefined;
  primary: boolean;
}

type FetchImplementation = typeof fetch;

async function fetchGoogle(
  input: string | URL,
  init: RequestInit,
  fetchImpl: FetchImplementation,
): Promise<Response> {
  try {
    return await fetchImpl(input, {
      ...init,
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GoogleCalendarUpstreamError(
      "Google 서비스에 연결하지 못했습니다.",
    );
  }
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

function scopesFromResponse(
  value: string | undefined,
  fallback: readonly string[] = [],
): string[] {
  if (!value) return [...fallback];
  return value.split(/\s+/).filter(Boolean);
}

function parseGoogleResponse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new GoogleCalendarUpstreamError(
      "Google API 응답 형식이 올바르지 않습니다.",
    );
  }
  return parsed.data;
}

export function buildGoogleAuthorizationUrl(
  config: GoogleCalendarConfig,
  state: string,
  codeChallenge: string,
): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeGoogleAuthorizationCode(
  config: GoogleCalendarConfig,
  code: string,
  codeVerifier: string,
  fetchImpl: FetchImplementation = fetch,
  now = Date.now(),
): Promise<GoogleTokenSet> {
  const response = await fetchGoogle(
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      cache: "no-store",
    },
    fetchImpl,
  );
  const body = await parseJson(response);
  if (!response.ok) {
    throw new GoogleCalendarUpstreamError(
      "Google OAuth 코드 교환에 실패했습니다.",
      response.status,
    );
  }
  const token = parseGoogleResponse(tokenResponseSchema, body);
  if (!token.refresh_token) {
    throw new GoogleCalendarReconnectRequiredError();
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    accessTokenExpiresAt: now + token.expires_in * 1000,
    grantedScopes: scopesFromResponse(token.scope, GOOGLE_CALENDAR_SCOPES),
  };
}

export async function refreshGoogleAccessToken(
  config: GoogleCalendarConfig,
  refreshToken: string,
  fetchImpl: FetchImplementation = fetch,
  now = Date.now(),
): Promise<GoogleTokenSet> {
  const response = await fetchGoogle(
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    },
    fetchImpl,
  );
  const body = await parseJson(response);
  if (!response.ok) {
    const tokenError = tokenErrorSchema.safeParse(body);
    if (tokenError.success && tokenError.data.error === "invalid_grant") {
      throw new GoogleCalendarReconnectRequiredError();
    }
    throw new GoogleCalendarUpstreamError(
      "Google 접근 토큰 갱신에 실패했습니다.",
      response.status,
    );
  }
  const token = parseGoogleResponse(tokenResponseSchema, body);
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    accessTokenExpiresAt: now + token.expires_in * 1000,
    grantedScopes: scopesFromResponse(token.scope),
  };
}

export async function revokeGoogleToken(
  token: string,
  fetchImpl: FetchImplementation = fetch,
): Promise<boolean> {
  const response = await fetchGoogle(
    GOOGLE_REVOKE_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      cache: "no-store",
    },
    fetchImpl,
  );
  return response.ok;
}

async function fetchGoogleJson(
  url: URL,
  accessToken: string,
  fetchImpl: FetchImplementation,
): Promise<unknown> {
  const response = await fetchGoogle(
    url,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
    fetchImpl,
  );
  const body = await parseJson(response);
  if (response.status === 401) {
    throw new GoogleCalendarReconnectRequiredError();
  }
  if (!response.ok) {
    throw new GoogleCalendarUpstreamError(
      "Google Calendar API 요청에 실패했습니다.",
      response.status,
    );
  }
  return body;
}

export async function listGoogleCalendars(
  accessToken: string,
  fetchImpl: FetchImplementation = fetch,
): Promise<GoogleCalendarListItem[]> {
  const calendars: GoogleCalendarListItem[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGE_COUNT; page += 1) {
    const url = new URL(`${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const parsed = parseGoogleResponse(
      calendarListResponseSchema,
      await fetchGoogleJson(url, accessToken, fetchImpl),
    );
    for (const item of parsed.items ?? []) {
      if (item.deleted) continue;
      calendars.push({
        id: item.id,
        name: item.summaryOverride?.trim() || item.summary?.trim() || "이름 없는 캘린더",
        color: item.backgroundColor,
        primary: item.primary === true,
      });
    }
    pageToken = parsed.nextPageToken;
    if (!pageToken) break;
  }
  return calendars;
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  fetchImpl: FetchImplementation = fetch,
  maxEvents = 500,
): Promise<{ events: GoogleCalendarRawEvent[]; truncated: boolean }> {
  const events: GoogleCalendarRawEvent[] = [];
  let pageToken: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_PAGE_COUNT; page += 1) {
    const url = new URL(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("timeZone", "Asia/Seoul");
    url.searchParams.set("maxResults", String(Math.min(2500, maxEvents)));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const parsed = parseGoogleResponse(
      eventsResponseSchema,
      await fetchGoogleJson(url, accessToken, fetchImpl),
    );
    for (const item of parsed.items ?? []) {
      if (events.length >= maxEvents) {
        truncated = true;
        break;
      }
      events.push(item);
    }
    pageToken = parsed.nextPageToken;
    if (events.length >= maxEvents && pageToken) truncated = true;
    if (!pageToken || events.length >= maxEvents) break;
  }

  return { events, truncated };
}
