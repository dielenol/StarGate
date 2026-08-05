import assert from "node:assert/strict";
import test from "node:test";

import {
  listGoogleCalendarEvents,
  listGoogleCalendars,
  refreshGoogleAccessToken,
} from "../../lib/google-calendar/google-api.ts";
import {
  GoogleCalendarReconnectRequiredError,
  GoogleCalendarUpstreamError,
} from "../../lib/google-calendar/errors.ts";

const CONFIG = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://example.com/callback",
  encryptionKey: Buffer.alloc(32, 1).toString("base64"),
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("calendar list follows pagination and drops deleted entries", async () => {
  const requestedUrls = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    requestedUrls.push(url);
    assert.equal(init.headers.Authorization, "Bearer access-secret");
    if (!url.searchParams.has("pageToken")) {
      return jsonResponse({
        items: [
          { id: "primary-id", summary: "기본", primary: true },
          { id: "deleted-id", summary: "삭제", deleted: true },
        ],
        nextPageToken: "next-page",
      });
    }
    return jsonResponse({
      items: [{ id: "team-id", summaryOverride: "팀 일정" }],
    });
  };

  const calendars = await listGoogleCalendars("access-secret", fetchImpl);

  assert.deepEqual(
    calendars.map(({ id, name, primary }) => ({ id, name, primary })),
    [
      { id: "primary-id", name: "기본", primary: true },
      { id: "team-id", name: "팀 일정", primary: false },
    ],
  );
  assert.equal(requestedUrls.length, 2);
  assert.equal(requestedUrls[1].searchParams.get("pageToken"), "next-page");
});

test("event pagination requests expanded instances and enforces the cap", async () => {
  let callCount = 0;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    callCount += 1;
    assert.equal(url.searchParams.get("singleEvents"), "true");
    assert.equal(url.searchParams.get("timeZone"), "Asia/Seoul");
    if (callCount === 1) {
      return jsonResponse({
        items: [
          {
            id: "1",
            start: { date: "2026-08-01" },
            end: { date: "2026-08-02" },
            description: "저장하거나 반환하면 안 되는 설명",
            location: "비공개 장소",
            attendees: [{ email: "private@example.com" }],
          },
          { id: "2", start: { date: "2026-08-02" }, end: { date: "2026-08-03" } },
        ],
        nextPageToken: "events-next",
      });
    }
    return jsonResponse({
      items: [
        { id: "3", start: { date: "2026-08-03" }, end: { date: "2026-08-04" } },
        { id: "4", start: { date: "2026-08-04" }, end: { date: "2026-08-05" } },
      ],
    });
  };

  const result = await listGoogleCalendarEvents(
    "access-secret",
    "private@example.com",
    "2026-07-25T15:00:00.000Z",
    "2026-09-05T15:00:00.000Z",
    fetchImpl,
    3,
  );

  assert.deepEqual(result.events.map((event) => event.id), ["1", "2", "3"]);
  assert.equal(JSON.stringify(result.events).includes("비공개 장소"), false);
  assert.equal(JSON.stringify(result.events).includes("private@example.com"), false);
  assert.equal(result.truncated, true);
  assert.equal(callCount, 2);
});

test("malformed Google responses are treated as upstream failures", async () => {
  await assert.rejects(
    listGoogleCalendars("access-secret", async () =>
      jsonResponse({ items: [{ id: 123 }] }),
    ),
    GoogleCalendarUpstreamError,
  );
  await assert.rejects(
    listGoogleCalendars("access-secret", async () => {
      throw new Error("network unavailable");
    }),
    GoogleCalendarUpstreamError,
  );
});

test("refresh token invalid_grant requires reconnect and absent scope stays unset", async () => {
  await assert.rejects(
    refreshGoogleAccessToken(CONFIG, "refresh-secret", async () =>
      jsonResponse({ error: "invalid_grant" }, 400),
    ),
    GoogleCalendarReconnectRequiredError,
  );

  const token = await refreshGoogleAccessToken(
    CONFIG,
    "refresh-secret",
    async () => jsonResponse({ access_token: "next-access", expires_in: 3600 }),
    1_000,
  );
  assert.deepEqual(token.grantedScopes, []);
  assert.equal(token.accessTokenExpiresAt, 3_601_000);
});
