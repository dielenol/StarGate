import { randomUUID } from "node:crypto";

import type { RealtimeTicketClaimsV1 } from "@stargate/core/domain/realtime";
import { SignJWT } from "jose";

const TICKET_LIFETIME_SECONDS = 60;
const MIN_SECRET_BYTES = 32;
const DEFAULT_ISSUER = "stargate-web";
const DEFAULT_AUDIENCE = "stargate-worker";

export interface RealtimeTicketResult {
  token: string;
  expiresAt: string;
  socketUrl: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

function readSocketUrl(): string {
  const value = requiredEnvironment("REALTIME_SOCKET_URL");
  const url = new URL(value);
  if (!["https:", "http:", "wss:", "ws:"].includes(url.protocol)) {
    throw new Error("REALTIME_SOCKET_URL은 http(s) 또는 ws(s) URL이어야 합니다.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "REALTIME_SOCKET_URL에는 인증정보, query, fragment를 포함할 수 없습니다.",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

export async function issueRealtimeTicket(input: {
  userId: string;
  role: string;
  now?: Date;
}): Promise<RealtimeTicketResult> {
  const secretValue = requiredEnvironment("REALTIME_TICKET_SECRET");
  const secret = new TextEncoder().encode(secretValue);
  if (secret.byteLength < MIN_SECRET_BYTES) {
    throw new Error(
      `REALTIME_TICKET_SECRET은 최소 ${MIN_SECRET_BYTES}바이트여야 합니다.`,
    );
  }

  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAtSeconds = issuedAt + TICKET_LIFETIME_SECONDS;
  const claims: RealtimeTicketClaimsV1 = {
    version: 1,
    sub: input.userId,
    role: input.role,
    status: "ACTIVE",
  };
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(
      process.env.REALTIME_TICKET_ISSUER?.trim() || DEFAULT_ISSUER,
    )
    .setAudience(
      process.env.REALTIME_TICKET_AUDIENCE?.trim() || DEFAULT_AUDIENCE,
    )
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .sign(secret);

  return {
    token,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    socketUrl: readSocketUrl(),
  };
}
