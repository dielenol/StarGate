import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { AUTH_SECRET } from "@/lib/env";
import {
  getGoogleCalendarConfig,
  isGoogleCalendarEnabled,
} from "@/lib/google-calendar/config";
import { buildGoogleAuthorizationUrl } from "@/lib/google-calendar/google-api";
import {
  createGoogleOAuthAttempt,
  getGoogleOAuthCookieName,
  getGoogleOAuthCookieOptions,
  GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/google-calendar/oauth-state";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    return NextResponse.redirect(
      new URL("/login", process.env.AUTH_URL ?? "http://localhost:3000"),
    );
  }
  if (!isGoogleCalendarEnabled()) {
    return NextResponse.json(
      { error: "Google Calendar 연동이 비활성화되어 있습니다." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const config = getGoogleCalendarConfig();
  const attempt = createGoogleOAuthAttempt(
    session.user.discordUserId,
    AUTH_SECRET,
  );
  const response = NextResponse.redirect(
    buildGoogleAuthorizationUrl(config, attempt.state, attempt.codeChallenge),
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(getGoogleOAuthCookieName(), attempt.cookieValue, {
    ...getGoogleOAuthCookieOptions(),
    maxAge: GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
