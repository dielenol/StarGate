import { createHmac, timingSafeEqual } from "node:crypto";

const LINK_STATE_TTL_MS = 10 * 60 * 1000;

interface DiscordLinkState {
  userId: string;
  nonce: string;
  expiresAt: number;
}

function requireEnv(primary: string, fallback?: string): string {
  const value = process.env[primary]?.trim() || (fallback ? process.env[fallback]?.trim() : "");
  if (!value) throw new Error(`${primary} 환경변수가 필요합니다.`);
  return value;
}

function signPayload(payload: string): string {
  return createHmac("sha256", requireEnv("AUTH_SECRET"))
    .update(payload)
    .digest("base64url");
}

export function createDiscordLinkState(userId: string): string {
  const state: DiscordLinkState = {
    userId,
    nonce: crypto.randomUUID(),
    expiresAt: Date.now() + LINK_STATE_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function verifyDiscordLinkState(raw: string): DiscordLinkState | null {
  const [payload, signature, extra] = raw.split(".");
  if (!payload || !signature || extra) return null;

  const expected = Buffer.from(signPayload(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<DiscordLinkState>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < Date.now()
    ) {
      return null;
    }
    return parsed as DiscordLinkState;
  } catch {
    return null;
  }
}

export function getDiscordLinkCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-stargate-discord-link"
    : "stargate-discord-link";
}

export function getDiscordLinkCookieOptions() {
  return {
    httpOnly: true,
    path: "/api/erp/account/discord/link/callback",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function getDiscordOAuthConfig() {
  return {
    clientId: requireEnv("STARGATE_DISCORD_CLIENT_ID", "DISCORD_CLIENT_ID"),
    clientSecret: requireEnv(
      "STARGATE_DISCORD_CLIENT_SECRET",
      "DISCORD_CLIENT_SECRET",
    ),
  };
}

export const DISCORD_LINK_STATE_MAX_AGE_SECONDS = LINK_STATE_TTL_MS / 1000;
