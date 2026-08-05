import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { AUTH_SECRET } from "@/lib/env";
import {
  getGoogleOAuthCookieName,
  getGoogleOAuthCookieOptions,
  verifyGoogleOAuthAttempt,
} from "@/lib/google-calendar/oauth-state";
import { connectGoogleCalendar } from "@/lib/google-calendar/service";

export const runtime = "nodejs";

function callbackRedirect(status: string): NextResponse {
  const url = new URL(
    "/calendar",
    process.env.AUTH_URL ?? "http://localhost:3000",
  );
  url.searchParams.set("google", status);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(getGoogleOAuthCookieName(), "", {
    ...getGoogleOAuthCookieOptions(),
    expires: new Date(0),
  });
  return response;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    return callbackRedirect("session-expired");
  }

  const state = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const cookieValue =
    request.cookies.get(getGoogleOAuthCookieName())?.value ?? "";
  const attempt = verifyGoogleOAuthAttempt(
    cookieValue,
    state,
    session.user.discordUserId,
    AUTH_SECRET,
  );
  if (!attempt) return callbackRedirect("invalid-state");
  if (request.nextUrl.searchParams.has("error")) {
    return callbackRedirect("denied");
  }
  if (!code) return callbackRedirect("invalid-state");

  try {
    await connectGoogleCalendar(
      session.user.discordUserId,
      code,
      attempt.codeVerifier,
    );
    return callbackRedirect("connected");
  } catch {
    return callbackRedirect("failed");
  }
}
