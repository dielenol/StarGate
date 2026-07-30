export class StaleVersionApiError extends Error {
  readonly code = "STALE_VERSION";
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "StaleVersionApiError";
  }
}

export async function throwMutationError(
  response: Response,
  fallbackMessage: string,
): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  const message = body.error ?? fallbackMessage;
  if (response.status === 409 && body.code === "STALE_VERSION") {
    throw new StaleVersionApiError(message);
  }
  throw new Error(message);
}
