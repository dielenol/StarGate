interface GoogleCalendarErrorBody {
  error?: string;
  code?: string;
}

export class GoogleCalendarClientError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "GoogleCalendarClientError";
    this.status = status;
    this.code = code ?? null;
  }
}

export async function readGoogleCalendarResponse<T>(
  response: Response,
  fallbackError: string,
): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as
    | T
    | GoogleCalendarErrorBody;
  if (!response.ok) {
    const errorBody = body as GoogleCalendarErrorBody;
    throw new GoogleCalendarClientError(
      errorBody.error ?? fallbackError,
      response.status,
      errorBody.code,
    );
  }
  return body as T;
}
