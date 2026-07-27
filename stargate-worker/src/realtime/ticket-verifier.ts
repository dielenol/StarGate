import type { RealtimeTicketClaimsV1 } from "@stargate/core";
import { jwtVerify } from "jose";

import type { RealtimeTicketConfig } from "../config.js";

export interface RealtimePrincipal {
  userId: string;
  role: string;
  /** handshake ticket 만료 시각이며, 연결 세션의 종료 시각은 아니다. */
  expiresAt: number;
}

export interface RealtimeTicketVerifier {
  verify(token: string): Promise<RealtimePrincipal>;
}

export class RealtimeTicketError extends Error {
  constructor(message = "유효하지 않은 실시간 연결 ticket입니다.") {
    super(message);
    this.name = "RealtimeTicketError";
  }
}

const MAX_TICKET_LIFETIME_SECONDS = 60;
const CLOCK_TOLERANCE_SECONDS = 5;

export function createRealtimeTicketVerifier(
  config: Pick<RealtimeTicketConfig, "secret" | "issuer" | "audience">,
): RealtimeTicketVerifier {
  const secret = new TextEncoder().encode(config.secret);

  return {
    async verify(token: string): Promise<RealtimePrincipal> {
      if (!token) throw new RealtimeTicketError();

      try {
        const { payload, protectedHeader } = await jwtVerify(token, secret, {
          algorithms: ["HS256"],
          issuer: config.issuer,
          audience: config.audience,
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
        });
        const claims = payload as typeof payload &
          Partial<RealtimeTicketClaimsV1>;
        const now = Math.floor(Date.now() / 1_000);
        if (
          protectedHeader.typ !== "JWT" ||
          claims.version !== 1 ||
          !claims.sub ||
          !claims.role ||
          claims.status !== "ACTIVE" ||
          typeof claims.iat !== "number" ||
          typeof claims.exp !== "number" ||
          claims.exp <= claims.iat ||
          claims.exp - claims.iat > MAX_TICKET_LIFETIME_SECONDS ||
          claims.iat > now + CLOCK_TOLERANCE_SECONDS ||
          claims.exp <= now
        ) {
          throw new RealtimeTicketError();
        }

        return {
          userId: claims.sub,
          role: claims.role,
          expiresAt: claims.exp * 1_000,
        };
      } catch (error) {
        if (error instanceof RealtimeTicketError) throw error;
        throw new RealtimeTicketError();
      }
    },
  };
}
