export class GoogleCalendarFeatureDisabledError extends Error {
  constructor() {
    super("Google Calendar 연동이 비활성화되어 있습니다.");
    this.name = "GoogleCalendarFeatureDisabledError";
  }
}

export class GoogleCalendarNotConnectedError extends Error {
  constructor() {
    super("Google Calendar가 연결되어 있지 않습니다.");
    this.name = "GoogleCalendarNotConnectedError";
  }
}

export class GoogleCalendarReconnectRequiredError extends Error {
  constructor() {
    super("Google Calendar 재연결이 필요합니다.");
    this.name = "GoogleCalendarReconnectRequiredError";
  }
}

export class GoogleCalendarUpstreamError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "GoogleCalendarUpstreamError";
    this.status = status;
  }
}
