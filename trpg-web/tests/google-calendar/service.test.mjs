import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];
const IDENTITY = {
  generation: "11111111-1111-4111-8111-111111111111",
  revision: "22222222-2222-4222-8222-222222222222",
};
const PAYLOAD = {
  refreshToken: "refresh-secret",
  accessToken: "access-secret",
  accessTokenExpiresAt: Date.now() + 60 * 60 * 1_000,
  selectedCalendarIds: ["primary-id"],
  grantedScopes: SCOPES,
};

let deleteCalls = [];
let exchangeToken = null;
let revokeCalls = [];
let updateCalls = [];
let upsertError = null;

mock.module("@/lib/db/google-calendar-connections", {
  namedExports: {
    deleteGoogleCalendarConnection: async (...args) => {
      deleteCalls.push(args);
      return true;
    },
    findGoogleCalendarConnection: async () => ({
      payload: PAYLOAD,
      reconnectRequired: false,
      identity: IDENTITY,
    }),
    markGoogleCalendarReconnectRequired: async () => IDENTITY,
    updateGoogleCalendarConnection: async (...args) => {
      updateCalls.push(args);
      return null;
    },
    upsertGoogleCalendarConnection: async () => {
      if (upsertError) throw upsertError;
    },
  },
});

mock.module(new URL("../../lib/google-calendar/config.ts", import.meta.url), {
  namedExports: {
    getGoogleCalendarConfig: () => ({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://example.com/callback",
      encryptionKey: Buffer.alloc(32, 1).toString("base64"),
    }),
    GOOGLE_CALENDAR_SCOPES: SCOPES,
  },
});

mock.module(new URL("../../lib/google-calendar/google-api.ts", import.meta.url), {
  namedExports: {
    exchangeGoogleAuthorizationCode: async () => exchangeToken,
    listGoogleCalendarEvents: async () => ({ events: [], truncated: false }),
    listGoogleCalendars: async () => [
      {
        id: "primary-id",
        name: "기본",
        color: "#4285f4",
        primary: true,
      },
    ],
    refreshGoogleAccessToken: async () => {
      throw new Error("refresh should not run");
    },
    revokeGoogleToken: async (token) => {
      revokeCalls.push(token);
      return true;
    },
  },
});

const {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  updateSelectedGoogleCalendars,
} = await import("../../lib/google-calendar/service.ts");
const { GoogleCalendarConnectionChangedError } = await import(
  "../../lib/google-calendar/errors.ts"
);

beforeEach(() => {
  deleteCalls = [];
  exchangeToken = {
    accessToken: "new-access-secret",
    refreshToken: "new-refresh-secret",
    accessTokenExpiresAt: Date.now() + 60 * 60 * 1_000,
    grantedScopes: SCOPES,
  };
  revokeCalls = [];
  updateCalls = [];
  upsertError = null;
});

test("unusable OAuth grants are revoked before reconnect is requested", async () => {
  exchangeToken = {
    ...exchangeToken,
    refreshToken: null,
    grantedScopes: [SCOPES[0]],
  };

  await assert.rejects(
    connectGoogleCalendar("user-1", "code", "verifier"),
    /재연결이 필요합니다/,
  );
  assert.deepEqual(revokeCalls, ["new-access-secret"]);
});

test("failed OAuth persistence revokes the token and removes only its generation", async () => {
  upsertError = new Error("database write failed");

  await assert.rejects(
    connectGoogleCalendar("user-1", "code", "verifier"),
    /database write failed/,
  );
  assert.deepEqual(revokeCalls, ["new-refresh-secret"]);
  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0][0], "user-1");
  assert.match(deleteCalls[0][1], /^[0-9a-f-]{36}$/);
});

test("selection updates stop after bounded CAS retries", async () => {
  await assert.rejects(
    updateSelectedGoogleCalendars("user-1", ["primary-id"]),
    GoogleCalendarConnectionChangedError,
  );
  assert.equal(updateCalls.length, 2);
});

test("disconnect deletes the generation that was actually revoked", async () => {
  assert.deepEqual(await disconnectGoogleCalendar("user-1"), { revoked: true });
  assert.deepEqual(revokeCalls, ["refresh-secret"]);
  assert.deepEqual(deleteCalls, [["user-1", IDENTITY.generation]]);
});
