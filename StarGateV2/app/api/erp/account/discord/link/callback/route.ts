import { NextRequest, NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import {
  getDiscordLinkCookieName,
  getDiscordLinkCookieOptions,
  getDiscordOAuthConfig,
  verifyDiscordLinkState,
} from "@/lib/auth/discord-link";
import { findUserByDiscordId, linkDiscord } from "@/lib/db/users";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_LINK_CALLBACK_PATH = "/api/erp/account/discord/link/callback";

interface DiscordTokenResponse {
  access_token?: string;
}

interface DiscordProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

function accountRedirect(request: NextRequest, status: string): NextResponse {
  const url = new URL("/erp/account", request.url);
  url.searchParams.set("discord", status);
  const response = NextResponse.redirect(url);
  response.cookies.set(getDiscordLinkCookieName(), "", {
    ...getDiscordLinkCookieOptions(),
    expires: new Date(0),
  });
  return response;
}

export async function GET(request: NextRequest) {
  const rawState = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const cookieState = request.cookies.get(getDiscordLinkCookieName())?.value;
  const state = rawState ? verifyDiscordLinkState(rawState) : null;
  if (!state || !code || !cookieState || cookieState !== rawState) {
    return accountRedirect(request, "invalid-state");
  }

  const session = await getActiveSession();
  if (!session?.user || session.user.id !== state.userId) {
    return accountRedirect(request, "session-expired");
  }

  try {
    const { clientId, clientSecret } = getDiscordOAuthConfig();
    const callbackUrl = new URL(DISCORD_LINK_CALLBACK_PATH, request.url);
    const tokenResponse = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl.toString(),
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) return accountRedirect(request, "oauth-failed");
    const token = (await tokenResponse.json()) as DiscordTokenResponse;
    if (!token.access_token) return accountRedirect(request, "oauth-failed");

    const profileResponse = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    if (!profileResponse.ok) return accountRedirect(request, "profile-failed");
    const profile = (await profileResponse.json()) as DiscordProfile;
    if (!profile.id || !profile.username) {
      return accountRedirect(request, "profile-failed");
    }

    const existing = await findUserByDiscordId(profile.id);
    if (existing?._id && String(existing._id) !== session.user.id) {
      return accountRedirect(request, "already-linked");
    }

    const avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : null;
    await linkDiscord(
      session.user.id,
      profile.id,
      profile.username,
      profile.global_name ?? null,
      avatar,
    );
    return accountRedirect(request, "linked");
  } catch (error) {
    console.error("[account/discord-link] callback failed", error);
    return accountRedirect(request, "failed");
  }
}
