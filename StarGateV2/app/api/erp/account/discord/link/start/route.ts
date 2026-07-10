import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import {
  createDiscordLinkState,
  DISCORD_LINK_STATE_MAX_AGE_SECONDS,
  getDiscordLinkCookieName,
  getDiscordLinkCookieOptions,
  getDiscordOAuthConfig,
} from "@/lib/auth/discord-link";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_LINK_CALLBACK_PATH = "/api/erp/account/discord/link/callback";

export async function GET(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { clientId } = getDiscordOAuthConfig();
  const state = createDiscordLinkState(session.user.id);
  const callbackUrl = new URL(DISCORD_LINK_CALLBACK_PATH, request.url);
  const authorizeUrl = new URL(DISCORD_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("scope", "identify");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(getDiscordLinkCookieName(), state, {
    ...getDiscordLinkCookieOptions(),
    maxAge: DISCORD_LINK_STATE_MAX_AGE_SECONDS,
  });
  return response;
}
