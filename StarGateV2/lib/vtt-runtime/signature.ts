import { createHash, createHmac, randomBytes } from "node:crypto";

export interface VttControlSignatureInput {
  secret: string;
  method: string;
  pathname: string;
  timestamp: string;
  nonce: string;
  body?: string;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalVttControlRequest(
  input: Omit<VttControlSignatureInput, "secret">,
): string {
  return [
    input.method.toUpperCase(),
    input.pathname,
    input.timestamp,
    input.nonce,
    sha256Hex(input.body ?? ""),
  ].join("\n");
}

export function signVttControlRequest(
  input: VttControlSignatureInput,
): string {
  const digest = createHmac("sha256", input.secret)
    .update(canonicalVttControlRequest(input))
    .digest("hex");
  return `v1=${digest}`;
}

export function createVttControlNonce(): string {
  return randomBytes(18).toString("base64url");
}
