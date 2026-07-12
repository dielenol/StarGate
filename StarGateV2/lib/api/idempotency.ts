const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

export function isValidIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(value);
}

export function readIdempotencyKey(request: Request): string | null {
  const value = request.headers.get("Idempotency-Key")?.trim();
  if (!value || !isValidIdempotencyKey(value)) return null;
  return value;
}

export function childIdempotencyKey(parent: string, suffix: string): string {
  const normalizedSuffix = suffix.replace(/[^A-Za-z0-9:_-]/g, "-");
  const suffixPart = `:${normalizedSuffix}`.slice(0, 64);
  const parentPart = parent.slice(0, 128 - suffixPart.length);
  return `${parentPart}${suffixPart}`;
}
