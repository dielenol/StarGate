import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  deleteGoogleCalendarConnection,
  findGoogleCalendarConnection,
  markGoogleCalendarReconnectRequired,
  updateGoogleCalendarConnection,
  upsertGoogleCalendarConnection,
  type GoogleCalendarConnectionIdentity,
} from "@/lib/db/google-calendar-connections";

import { getGoogleCalendarConfig, GOOGLE_CALENDAR_SCOPES } from "./config";
import {
  GoogleCalendarConnectionChangedError,
  GoogleCalendarNotConnectedError,
  GoogleCalendarReconnectRequiredError,
  GoogleCalendarUpstreamError,
} from "./errors";
import {
  getGoogleCalendarVisibleRange,
  normalizeGoogleCalendarEvents,
  sanitizeGoogleCalendarColor,
} from "./events";
import {
  exchangeGoogleAuthorizationCode,
  listGoogleCalendarEvents,
  listGoogleCalendars,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  type GoogleCalendarListItem,
} from "./google-api";
import {
  type GoogleCalendarEventView,
  type GoogleCalendarEventsView,
  type GoogleCalendarOptionView,
  type GoogleCalendarSecretPayload,
} from "./types";
import { parseSelectedGoogleCalendarIds } from "./selection";

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const MAX_RETURNED_EVENT_SLICES = 500;
const MAX_CONNECTION_UPDATE_RETRIES = 1;

function hasRequiredScopes(grantedScopes: string[]): boolean {
  const granted = new Set(grantedScopes);
  return GOOGLE_CALENDAR_SCOPES.every((scope) => granted.has(scope));
}

async function requireConnection(discordUserId: string) {
  const connection = await findGoogleCalendarConnection(discordUserId);
  if (!connection) throw new GoogleCalendarNotConnectedError();
  if (connection.reconnectRequired) {
    throw new GoogleCalendarReconnectRequiredError();
  }
  return connection;
}

async function markReconnectOnFailure<T>(
  discordUserId: string,
  identity: GoogleCalendarConnectionIdentity,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GoogleCalendarReconnectRequiredError) {
      const marked = await markGoogleCalendarReconnectRequired(
        discordUserId,
        identity,
      );
      if (!marked) throw new GoogleCalendarConnectionChangedError();
    }
    throw error;
  }
}

async function getValidAccessToken(
  discordUserId: string,
  remainingRetries = MAX_CONNECTION_UPDATE_RETRIES,
): Promise<{
  accessToken: string;
  payload: GoogleCalendarSecretPayload;
  identity: GoogleCalendarConnectionIdentity;
}> {
  const connection = await requireConnection(discordUserId);
  const payload = connection.payload;
  if (
    payload.accessToken &&
    payload.accessTokenExpiresAt &&
    payload.accessTokenExpiresAt > Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS
  ) {
    return {
      accessToken: payload.accessToken,
      payload,
      identity: connection.identity,
    };
  }

  let refreshed: Awaited<ReturnType<typeof refreshGoogleAccessToken>>;
  try {
    refreshed = await refreshGoogleAccessToken(
      getGoogleCalendarConfig(),
      payload.refreshToken,
    );
  } catch (error) {
    if (error instanceof GoogleCalendarReconnectRequiredError) {
      const marked = await markGoogleCalendarReconnectRequired(
        discordUserId,
        connection.identity,
      );
      if (!marked) throw new GoogleCalendarConnectionChangedError();
    }
    throw error;
  }

  const nextPayload: GoogleCalendarSecretPayload = {
    ...payload,
    refreshToken: refreshed.refreshToken ?? payload.refreshToken,
    accessToken: refreshed.accessToken,
    accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
    grantedScopes:
      refreshed.grantedScopes.length > 0
        ? refreshed.grantedScopes
        : payload.grantedScopes,
  };
  if (!hasRequiredScopes(nextPayload.grantedScopes)) {
    const marked = await markGoogleCalendarReconnectRequired(
      discordUserId,
      connection.identity,
    );
    if (!marked) throw new GoogleCalendarConnectionChangedError();
    throw new GoogleCalendarReconnectRequiredError();
  }

  const nextIdentity = await updateGoogleCalendarConnection(
    discordUserId,
    connection.identity,
    nextPayload,
  );
  if (!nextIdentity) {
    if (remainingRetries > 0) {
      return getValidAccessToken(discordUserId, remainingRetries - 1);
    }
    throw new GoogleCalendarConnectionChangedError();
  }
  return {
    accessToken: refreshed.accessToken,
    payload: nextPayload,
    identity: nextIdentity,
  };
}

export async function connectGoogleCalendar(
  discordUserId: string,
  code: string,
  codeVerifier: string,
): Promise<void> {
  const token = await exchangeGoogleAuthorizationCode(
    getGoogleCalendarConfig(),
    code,
    codeVerifier,
  );
  if (!token.refreshToken || !hasRequiredScopes(token.grantedScopes)) {
    await revokeGoogleToken(token.refreshToken ?? token.accessToken).catch(
      () => false,
    );
    throw new GoogleCalendarReconnectRequiredError();
  }
  const generation = randomUUID();
  try {
    await upsertGoogleCalendarConnection(
      discordUserId,
      {
        refreshToken: token.refreshToken,
        accessToken: token.accessToken,
        accessTokenExpiresAt: token.accessTokenExpiresAt,
        selectedCalendarIds: ["primary"],
        grantedScopes: token.grantedScopes,
      },
      generation,
    );
  } catch (error) {
    await Promise.allSettled([
      revokeGoogleToken(token.refreshToken),
      deleteGoogleCalendarConnection(discordUserId, generation),
    ]);
    throw error;
  }
}

function isSelectedCalendar(
  calendar: GoogleCalendarListItem,
  selectedIds: Set<string>,
): boolean {
  return (
    selectedIds.has(calendar.id) ||
    (calendar.primary && selectedIds.has("primary"))
  );
}

export async function getGoogleCalendarOptions(
  discordUserId: string,
): Promise<GoogleCalendarOptionView[]> {
  const { accessToken, payload, identity } =
    await getValidAccessToken(discordUserId);
  const calendars = await markReconnectOnFailure(
    discordUserId,
    identity,
    () => listGoogleCalendars(accessToken),
  );
  const selectedIds = new Set(payload.selectedCalendarIds);
  return calendars
    .map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      color: sanitizeGoogleCalendarColor(calendar.color),
      primary: calendar.primary,
      selected: isSelectedCalendar(calendar, selectedIds),
    }))
    .sort(
      (a, b) =>
        Number(b.primary) - Number(a.primary) ||
        a.name.localeCompare(b.name, "ko"),
    );
}

export async function updateSelectedGoogleCalendars(
  discordUserId: string,
  calendarIds: unknown,
): Promise<number> {
  const selectedIds = parseSelectedGoogleCalendarIds(calendarIds);
  return updateValidatedSelectedGoogleCalendars(
    discordUserId,
    selectedIds,
    MAX_CONNECTION_UPDATE_RETRIES,
  );
}

async function updateValidatedSelectedGoogleCalendars(
  discordUserId: string,
  selectedIds: string[],
  remainingRetries: number,
): Promise<number> {
  const { accessToken, payload, identity } =
    await getValidAccessToken(discordUserId);
  const calendars = await markReconnectOnFailure(
    discordUserId,
    identity,
    () => listGoogleCalendars(accessToken),
  );
  const allowedIds = new Set(calendars.map((calendar) => calendar.id));
  if (selectedIds.some((id) => !allowedIds.has(id))) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["calendarIds"],
        message: "선택할 수 없는 Google 캘린더가 포함되어 있습니다.",
      },
    ]);
  }
  const nextIdentity = await updateGoogleCalendarConnection(
    discordUserId,
    identity,
    { ...payload, selectedCalendarIds: selectedIds },
  );
  if (!nextIdentity) {
    if (remainingRetries > 0) {
      return updateValidatedSelectedGoogleCalendars(
        discordUserId,
        selectedIds,
        remainingRetries - 1,
      );
    }
    throw new GoogleCalendarConnectionChangedError();
  }
  return selectedIds.length;
}

function resolveCalendarForRequest(
  selectedId: string,
  calendars: GoogleCalendarListItem[],
): { requestId: string; stableId: string; color: string } | null {
  if (selectedId === "primary") {
    const primary = calendars.find((calendar) => calendar.primary);
    if (!primary) return null;
    return {
      requestId: "primary",
      stableId: primary.id,
      color: sanitizeGoogleCalendarColor(primary.color),
    };
  }
  const calendar = calendars.find((item) => item.id === selectedId);
  if (!calendar) return null;
  return {
    requestId: calendar.id,
    stableId: calendar.id,
    color: sanitizeGoogleCalendarColor(calendar.color),
  };
}

export async function getGoogleCalendarEvents(
  discordUserId: string,
  year: number,
  month: number,
): Promise<GoogleCalendarEventsView> {
  const { accessToken, payload, identity } =
    await getValidAccessToken(discordUserId);
  if (payload.selectedCalendarIds.length === 0) {
    return { events: [], failedCalendarCount: 0, truncated: false };
  }

  const calendars = await markReconnectOnFailure(
    discordUserId,
    identity,
    () => listGoogleCalendars(accessToken),
  );
  const selected = payload.selectedCalendarIds
    .map((id) => resolveCalendarForRequest(id, calendars))
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const missingCalendarCount =
    payload.selectedCalendarIds.length - selected.length;
  const range = getGoogleCalendarVisibleRange(year, month);
  const results = await Promise.allSettled(
    selected.map(async (calendar) => {
      const result = await listGoogleCalendarEvents(
        accessToken,
        calendar.requestId,
        range.timeMin,
        range.timeMax,
      );
      return {
        events: normalizeGoogleCalendarEvents(
          result.events,
          calendar.stableId,
          calendar.color,
          range,
        ),
        truncated: result.truncated,
      };
    }),
  );

  const events: GoogleCalendarEventView[] = [];
  let failedCalendarCount = missingCalendarCount;
  let successfulCalendarCount = 0;
  let truncated = false;
  for (const result of results) {
    if (result.status === "rejected") {
      if (result.reason instanceof GoogleCalendarReconnectRequiredError) {
        const marked = await markGoogleCalendarReconnectRequired(
          discordUserId,
          identity,
        );
        if (!marked) throw new GoogleCalendarConnectionChangedError();
        throw result.reason;
      }
      failedCalendarCount += 1;
      continue;
    }
    successfulCalendarCount += 1;
    events.push(...result.value.events);
    truncated ||= result.value.truncated;
  }

  if (selected.length > 0 && successfulCalendarCount === 0) {
    throw new GoogleCalendarUpstreamError(
      "Google 일정을 불러오지 못했습니다.",
    );
  }

  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.sortKey.localeCompare(b.sortKey) ||
      a.title.localeCompare(b.title, "ko"),
  );
  if (events.length > MAX_RETURNED_EVENT_SLICES) {
    events.length = MAX_RETURNED_EVENT_SLICES;
    truncated = true;
  }

  return { events, failedCalendarCount, truncated };
}

export async function disconnectGoogleCalendar(
  discordUserId: string,
): Promise<{ revoked: boolean }> {
  let connection: Awaited<ReturnType<typeof findGoogleCalendarConnection>>;
  try {
    connection = await findGoogleCalendarConnection(discordUserId);
  } catch {
    await deleteGoogleCalendarConnection(discordUserId);
    return { revoked: false };
  }
  if (!connection) return { revoked: true };

  let revoked = false;
  try {
    revoked = await revokeGoogleToken(connection.payload.refreshToken);
  } catch {
    revoked = false;
  } finally {
    await deleteGoogleCalendarConnection(
      discordUserId,
      connection.identity.generation,
    );
  }
  return { revoked };
}
