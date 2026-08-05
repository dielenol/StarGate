export const MAX_SELECTED_GOOGLE_CALENDARS = 10;

export interface GoogleCalendarConnectionView {
  enabled: boolean;
  available: boolean;
  connected: boolean;
  reconnectRequired: boolean;
  selectedCalendarCount: number;
}

export interface GoogleCalendarOptionView {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  selected: boolean;
}

/** KST 날짜 한 칸에 바로 그릴 수 있도록 정규화한 개인 일정 조각. */
export interface GoogleCalendarEventView {
  id: string;
  date: string;
  title: string;
  timeLabel: string;
  sortKey: string;
  allDay: boolean;
  color: string;
  htmlLink: string | null;
}

export interface GoogleCalendarEventsView {
  events: GoogleCalendarEventView[];
  failedCalendarCount: number;
  truncated: boolean;
}

export interface GoogleCalendarSecretPayload {
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  selectedCalendarIds: string[];
  grantedScopes: string[];
}
