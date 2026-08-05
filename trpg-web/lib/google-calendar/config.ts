import { GoogleCalendarFeatureDisabledError } from "./errors";
import { decodeGoogleCalendarEncryptionKey } from "./crypto";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;

export const GOOGLE_CALENDAR_CALLBACK_PATH =
  "/api/integrations/google-calendar/callback";

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value === "undefined" || value === "null") {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }
  return value;
}

export function isGoogleCalendarEnabled(): boolean {
  return process.env.GOOGLE_CALENDAR_ENABLED?.trim().toLowerCase() === "true";
}

export function assertGoogleCalendarEnabled(): void {
  if (!isGoogleCalendarEnabled()) {
    throw new GoogleCalendarFeatureDisabledError();
  }
}

export function getGoogleCalendarConfig(): GoogleCalendarConfig {
  assertGoogleCalendarEnabled();

  const authUrl = new URL(requireEnv("AUTH_URL"));
  const redirectUri = new URL(GOOGLE_CALENDAR_CALLBACK_PATH, authUrl);

  const encryptionKey = requireEnv(
    "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY",
  );
  decodeGoogleCalendarEncryptionKey(encryptionKey);

  return {
    clientId: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    redirectUri: redirectUri.toString(),
    encryptionKey,
  };
}
