import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { z } from "zod";

mock.module("next/server.js", {
  namedExports: {
    NextResponse: {
      json: (body, init) => Response.json(body, init),
    },
  },
});

const { googleCalendarErrorResponse, parseGoogleCalendarJson } = await import(
  "../../lib/google-calendar/http.ts"
);

const bodySchema = z.object({ calendarIds: z.array(z.string()) });

test("malformed JSON is mapped to an INVALID_REQUEST 400 response", async () => {
  const request = new Request("https://example.com/api/calendars", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });

  let parsingError;
  try {
    await parseGoogleCalendarJson(request, bodySchema);
  } catch (error) {
    parsingError = error;
  }
  const response = googleCalendarErrorResponse(parsingError);

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "요청 값이 올바르지 않습니다.",
    code: "INVALID_REQUEST",
  });
});

test("valid JSON is parsed through the supplied schema", async () => {
  const request = new Request("https://example.com/api/calendars", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calendarIds: ["primary"] }),
  });

  assert.deepEqual(await parseGoogleCalendarJson(request, bodySchema), {
    calendarIds: ["primary"],
  });
});
