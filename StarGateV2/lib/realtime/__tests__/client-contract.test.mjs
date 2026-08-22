import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativeUrl) {
  return fs.readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const provider = read("../../../components/erp/RealtimeProvider.tsx");
const context = read("../client-context.tsx");
const config = read("../config.ts");
const toasts = read(
  "../../../components/erp/RealtimeNotificationToasts.tsx",
);
const notificationQuery = read(
  "../../../hooks/queries/useNotificationsQuery.ts",
);
const tradesQuery = read("../../../hooks/queries/useTradesQuery.ts");
const pageLocksQuery = read(
  "../../../hooks/queries/usePageLocksQuery.ts",
);
const sessionsQuery = read("../../../hooks/queries/useSessionsQuery.ts");
const stocksQuery = read("../../../hooks/queries/useStocksQuery.ts");
const equipmentQuery = read(
  "../../../hooks/queries/useEquipmentShopQuery.ts",
);
const galleryQuery = read("../../../hooks/queries/useGalleryQuery.ts");
const hallOfFameQuery = read(
  "../../../hooks/queries/useHallOfFameQuery.ts",
);
const realtimeContract = read(
  "../../../../packages/core/src/domain/realtime.ts",
);
const characterRoute = read(
  "../../../app/api/erp/characters/[id]/route.ts",
);
const wikiRoute = read("../../../app/api/erp/wiki/[id]/route.ts");
const reportRoute = read(
  "../../../app/api/erp/session-reports/[id]/route.ts",
);

test("off/observe/primary와 4단계 연결 상태 계약을 제공한다", () => {
  for (const mode of ["off", "observe", "primary"]) {
    assert.match(config, new RegExp(`"${mode}"`));
  }
  for (const state of [
    "connecting",
    "connected",
    "degraded",
    "disabled",
  ]) {
    assert.match(context, new RegExp(`"${state}"`));
  }
  assert.match(
    context,
    /mode === "primary" && state === "connected"[\s\S]*\? false/,
  );
});

test("실시간 클라이언트는 중복 방지·100ms batching·gap 재검증을 적용한다", () => {
  assert.match(provider, /const INVALIDATION_BATCH_MS = 100/);
  assert.match(provider, /const RECENT_EVENT_ID_LIMIT = 256/);
  assert.match(provider, /recentEventIds\.has\(eventId\)/);
  assert.match(provider, /queryKeysForRealtimeResources\(resources\)/);
  // gap 재검증은 전체 active refetch 가 아니라 realtime 매핑 리소스 전체로 한정한다.
  assert.match(
    provider,
    /queryKeysForRealtimeResources\(REALTIME_RESOURCES\)/,
  );
  assert.doesNotMatch(provider, /refetchQueries\(\{ type: "active" \}\)/);
  assert.match(provider, /0\.75 \+ Math\.random\(\) \* 0\.5/);
});

test("socket.io-client 는 정적 value import 없이 연결 시점에 로드되고 unmount 후 연결을 만들지 않는다", () => {
  // 타입 import 만 허용 — value import 는 ERP 초기 번들에 socket.io 를 되돌린다.
  assert.match(provider, /import type \{ Socket \} from "socket\.io-client"/);
  assert.doesNotMatch(
    provider,
    /import \{[^}]*\bio\b[^}]*\} from "socket\.io-client"/,
  );
  assert.match(provider, /import\("socket\.io-client"\)/);
  // 늦게 resolve 된 import/ticket 이 unmount 이후 소켓을 만들지 않는 가드.
  assert.match(provider, /let disposed = false/);
  assert.match(provider, /if \(disposed \|\| controller\.signal\.aborted\) return/);
});

test("session-refresh 공개 frame은 식별자나 DB 값을 포함하지 않는다", () => {
  assert.match(realtimeContract, /interface RealtimeSessionRefreshV1/);
  assert.match(realtimeContract, /reason: "identity-changed"/);
  const eventBlock = realtimeContract.slice(
    realtimeContract.indexOf("interface RealtimeSessionRefreshV1"),
    realtimeContract.indexOf("interface RealtimeTicketClaimsV1"),
  );
  for (const forbidden of ["userId", "name", "balance", "quantity"]) {
    assert.doesNotMatch(eventBlock, new RegExp(forbidden));
  }
  assert.match(provider, /window\.location\.reload\(\)/);
});

test("알림 toast는 최초 이력을 제외하고 burst·접근성·6초 종료를 적용한다", () => {
  assert.match(toasts, /const TOAST_DURATION_MS = 6_000/);
  assert.match(toasts, /const MAX_INDIVIDUAL_TOASTS = 3/);
  assert.match(toasts, /if \(!initializedRef\.current\)/);
  assert.match(toasts, /새 알림 \$\{incoming\.length\}건/);
  assert.match(toasts, /aria-live="polite"/);
});

test("전환 대상 고정 폴링은 연결 상태 기반 fallback을 사용한다", () => {
  for (const source of [
    notificationQuery,
    tradesQuery,
    pageLocksQuery,
    sessionsQuery,
    stocksQuery,
    equipmentQuery,
    galleryQuery,
    hallOfFameQuery,
  ]) {
    assert.match(source, /useRealtimeRefetchInterval/);
  }
});

test("캐릭터·위키·보고서 PATCH는 expectedUpdatedAt과 STALE_VERSION을 강제한다", () => {
  for (const source of [characterRoute, wikiRoute, reportRoute]) {
    assert.match(source, /parseExpectedUpdatedAt\(body\)/);
    assert.match(source, /code: "STALE_VERSION"/);
    assert.match(source, /isExpectedUpdatedAtCurrent/);
  }
});
