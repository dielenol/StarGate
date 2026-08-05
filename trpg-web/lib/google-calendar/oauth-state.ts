import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const OAUTH_COOKIE_VERSION = 1;

interface GoogleOAuthCookiePayload {
  version: typeof OAUTH_COOKIE_VERSION;
  discordUserId: string;
  state: string;
  codeVerifier: string;
  expiresAt: number;
}

export interface GoogleOAuthAttempt {
  state: string;
  codeChallenge: string;
  cookieValue: string;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createGoogleOAuthAttempt(
  discordUserId: string,
  secret: string,
  now = Date.now(),
): GoogleOAuthAttempt {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(64).toString("base64url");
  const cookiePayload: GoogleOAuthCookiePayload = {
    version: OAUTH_COOKIE_VERSION,
    discordUserId,
    state,
    codeVerifier,
    expiresAt: now + OAUTH_ATTEMPT_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(cookiePayload)).toString(
    "base64url",
  );
  const signature = signPayload(encoded, secret);

  return {
    state,
    codeChallenge: createHash("sha256")
      .update(codeVerifier)
      .digest("base64url"),
    cookieValue: `${encoded}.${signature}`,
  };
}

export function verifyGoogleOAuthAttempt(
  cookieValue: string,
  receivedState: string,
  discordUserId: string,
  secret: string,
  now = Date.now(),
): { codeVerifier: string } | null {
  const [encoded, signature, extra] = cookieValue.split(".");
  if (!encoded || !signature || extra) return null;

  const expected = Buffer.from(signPayload(encoded, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<GoogleOAuthCookiePayload>;
    if (
      parsed.version !== OAUTH_COOKIE_VERSION ||
      parsed.discordUserId !== discordUserId ||
      parsed.state !== receivedState ||
      typeof parsed.codeVerifier !== "string" ||
      parsed.codeVerifier.length < 43 ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now
    ) {
      return null;
    }
    return { codeVerifier: parsed.codeVerifier };
  } catch {
    return null;
  }
}

export function getGoogleOAuthCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-trpg-google-calendar-oauth"
    : "trpg-google-calendar-oauth";
}

export function getGoogleOAuthCookieOptions() {
  return {
    httpOnly: true,
    path: "/api/integrations/google-calendar/callback",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export const GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS =
  OAUTH_ATTEMPT_TTL_MS / 1000;
