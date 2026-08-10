import { createHash } from "node:crypto";

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
  if (parent.length + suffixPart.length <= 128) {
    return `${parent}${suffixPart}`;
  }
  const parentDigest = createHash("sha256")
    .update(parent)
    .digest("hex")
    .slice(0, 32);
  const digestPart = `:${parentDigest}`;
  const parentPart = parent.slice(
    0,
    128 - digestPart.length - suffixPart.length,
  );
  return `${parentPart}${digestPart}${suffixPart}`;
}
