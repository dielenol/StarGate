import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import {
  GoogleCalendarConnectionChangedError,
  GoogleCalendarFeatureDisabledError,
  GoogleCalendarInvalidRequestError,
  GoogleCalendarNotConnectedError,
  GoogleCalendarReconnectRequiredError,
  GoogleCalendarUpstreamError,
} from "./errors";

export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const expectedOrigin = new URL(process.env.AUTH_URL ?? request.url).origin;
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function googleCalendarErrorResponse(error: unknown): NextResponse {
  if (error instanceof GoogleCalendarFeatureDisabledError) {
    return NextResponse.json(
      { error: error.message, code: "FEATURE_DISABLED" },
      { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  if (error instanceof GoogleCalendarReconnectRequiredError) {
    return NextResponse.json(
      { error: error.message, code: "GOOGLE_RECONNECT_REQUIRED" },
      { status: 409, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  if (error instanceof GoogleCalendarNotConnectedError) {
    return NextResponse.json(
      { error: error.message, code: "GOOGLE_NOT_CONNECTED" },
      { status: 409, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  if (error instanceof GoogleCalendarConnectionChangedError) {
    return NextResponse.json(
      { error: error.message, code: "GOOGLE_CONNECTION_CHANGED" },
      { status: 409, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  if (
    error instanceof GoogleCalendarInvalidRequestError ||
    error instanceof ZodError
  ) {
    return NextResponse.json(
      { error: "요청 값이 올바르지 않습니다.", code: "INVALID_REQUEST" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  if (error instanceof GoogleCalendarUpstreamError) {
    return NextResponse.json(
      { error: error.message, code: "GOOGLE_UPSTREAM_ERROR" },
      { status: 502, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  return NextResponse.json(
    { error: "Google Calendar 처리 중 오류가 발생했습니다." },
    { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
  );
}

export async function parseGoogleCalendarJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new GoogleCalendarInvalidRequestError();
  }
  return schema.parse(body);
}

export function unauthorizedGoogleCalendarResponse(): NextResponse {
  return NextResponse.json(
    { error: "로그인이 필요합니다." },
    { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
  );
}

export function forbiddenGoogleCalendarResponse(): NextResponse {
  return NextResponse.json(
    { error: "허용되지 않은 요청입니다." },
    { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
  );
}
