/**
 * WebSocket은 DB 레코드를 전달하지 않고 TanStack Query 재조회 범위만 알린다.
 * 이 목록은 StarGateV2와 stargate-worker 사이의 공개 계약이다.
 */
export const REALTIME_RESOURCES = [
  "users",
  "characters",
  "personnel",
  "credits",
  "inventory",
  "notifications",
  "shop",
  "stocks",
  "trades",
  "sessions",
  "reports",
  "gallery",
  "equipment-shop",
  "wiki",
  "factions",
  "page-locks",
  "hall-of-fame",
  "hall-of-fame-novex",
] as const;

export type RealtimeResource = (typeof REALTIME_RESOURCES)[number];

const REALTIME_RESOURCE_SET = new Set<string>(REALTIME_RESOURCES);

export function isRealtimeResource(value: unknown): value is RealtimeResource {
  return typeof value === "string" && REALTIME_RESOURCE_SET.has(value);
}

export interface RealtimeInvalidateV1 {
  version: 1;
  id: string;
  type: "invalidate";
  resources: RealtimeResource[];
  emittedAt: string;
}

export interface RealtimeSessionRefreshV1 {
  version: 1;
  id: string;
  type: "session-refresh";
  reason: "identity-changed";
  emittedAt: string;
}

/**
 * Auth.js 세션을 확인한 StarGateV2만 이 claim을 발급한다.
 * 토큰 자체는 60초 이내 만료되고 worker는 ACTIVE 사용자만 허용한다.
 */
export interface RealtimeTicketClaimsV1 {
  version: 1;
  sub: string;
  role: string;
  status: "ACTIVE";
}
