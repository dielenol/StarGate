import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativeUrl) {
  return fs.readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const marketCrud = read(
  "../../../../packages/shared-db/src/crud/stock-market.ts",
);
const stockCrud = read("../../../../packages/shared-db/src/crud/stocks.ts");
const stockTick = read(
  "../../../../packages/core/src/operations/stocks-tick.ts",
);
const createRoute = read(
  "../../../app/api/erp/admin/stocks/corporate-actions/route.ts",
);
const cancelRoute = read(
  "../../../app/api/erp/admin/stocks/corporate-actions/[actionId]/route.ts",
);
const statusRoute = read(
  "../../../app/api/erp/admin/stocks/trading-status/route.ts",
);
const mutationHook = read(
  "../../../hooks/mutations/useAdminStockMarketMutation.ts",
);
const adminPanel = read(
  "../../../app/(erp)/erp/admin/stocks/StockNovexOperationsPanels.tsx",
);
const publicDisclosuresRoute = read(
  "../../../app/api/erp/stocks/disclosures/route.ts",
);
const adminDisclosuresRoute = read(
  "../../../app/api/erp/admin/stocks/disclosures/route.ts",
);
const adminDisclosureRoute = read(
  "../../../app/api/erp/admin/stocks/disclosures/[disclosureId]/route.ts",
);
const stockQueries = read("../../../hooks/queries/useStocksQuery.ts");
const adminMarketQueries = read(
  "../../../hooks/queries/useAdminStockMarketQuery.ts",
);
const disclosureQueries = read(
  "../../../hooks/queries/useStockDisclosuresQuery.ts",
);
const tradeSerializer = read("../../../lib/db/trades.ts");
const scenarioScript = read(
  "../../../scripts/schedule-starmart-capital-scenario.ts",
);

test("유상증자 API는 GM·멱등 경계와 NOVEX 회차/배수/조정률을 검증한다", () => {
  assert.match(createRoute, /requireRole\(session\.user\.role, "GM"\)/);
  assert.match(createRoute, /readIdempotencyKey\(request\)/);
  assert.match(createRoute, /type !== "RIGHTS_OFFERING"/);
  assert.match(createRoute, /toStockSlotKey\(announceAt\)/);
  assert.match(createRoute, /announceAt\.getTime\(\) >= executeAt\.getTime\(\)/);
  assert.match(createRoute, /ratio < 2 \|\|[\s\S]*ratio > 10/);
  assert.match(createRoute, /adjustment < -50 \|\|[\s\S]*adjustment > 75/);
  assert.match(createRoute, /reason\.length > 500/);
});

test("예약 owner와 active halt owner는 수동 상태 변경을 409로 막는다", () => {
  assert.match(stockCrud, /corporateActionReservationId: \{ \$exists: false \}/);
  assert.match(stockCrud, /corporateActionHaltId: \{ \$exists: false \}/);
  assert.match(statusRoute, /StockCorporateActionHaltConflictError/);
  assert.match(statusRoute, /status: 409/);
  assert.match(marketCrud, /corporateActionReservationId: action\._id/);
  assert.match(marketCrud, /corporateActionHaltId: actionId/);
  assert.match(marketCrud, /corporateActionHaltId: actionId[\s\S]*\$unset/);
  assert.match(marketCrud, /status: \{ \$in: \["SCHEDULED", "HALTED"\] \}/);
  assert.match(
    marketCrud,
    /cancelStockCorporateAction[\s\S]*claimStockMarketMigrationReady\(session\)/,
  );
  assert.match(marketCrud, /cancelManagedCorporateActionDisclosure/);
  assert.match(
    marketCrud,
    /status: "COMPLETED"[\s\S]*remainingDisclosuresCancelledAt[\s\S]*allowPublished: true/,
  );
  assert.match(marketCrud, /abort-resume/);
  assert.match(cancelRoute, /StockMarketMigrationNotReadyError/);
  assert.doesNotMatch(cancelRoute, /if \(!isNovexV2Enabled\(\)\)/);
});

test("merged 발표·실행은 첫 회차 halt만 commit하고 overdue 실행 공시를 다음 회차에 exact 적용한다", () => {
  assert.match(marketCrud, /announcesInBatch && options\.allowCollapsedRightsOffering === true/);
  assert.match(marketCrud, /action\.status === "HALTED"[\s\S]*latestMergedSlotKey/);
  assert.match(marketCrud, /executingRightsOfferingIds/);
  assert.match(marketCrud, /disclosure\._id\.endsWith\(":execution"\)/);
  assert.match(marketCrud, /return executingRightsOfferingIds\.has\(actionId\)/);
  assert.match(marketCrud, /deferredByCorporateActionId/);
  assert.match(marketCrud, /deferredDisclosureIds\.has\(disclosure\._id\)/);
  assert.match(marketCrud, /price\.corporateActionHaltId[\s\S]*consumeFlow: false/);
  assert.match(stockTick, /RIGHTS_OFFERING_ANNOUNCE/);
  assert.match(stockTick, /corporateActionHaltId: action\._id/);
  assert.match(stockTick, /current\.corporateActionHaltId[\s\S]*consumeFlow: false/);
});

test("실행 transaction은 보유량·평단·가격·발행계수·resume을 함께 처리한다", () => {
  const start = marketCrud.indexOf("export async function applyStockRightsOffering");
  const end = marketCrud.indexOf("export async function applyForwardStockSplit", start);
  const block = marketCrud.slice(start, end);
  assert.match(block, /\$multiply: \["\$shares", action\.factor\]/);
  assert.match(block, /\$divide: \["\$avgPrice", action\.factor\]/);
  assert.match(block, /cumulativeCapitalIncreaseFactor/);
  assert.match(block, /source: "rights-offering"/);
  assert.match(block, /eventKind: "RESUME"/);
  assert.match(block, /partitionKey: `stock:\$\{action\.ticker\}`/);
  const roundStart = marketCrud.indexOf(
    "export async function applyStockMarketRoundTransaction",
  );
  const roundEnd = marketCrud.indexOf(
    "export function calculateForwardStockSplitPrices",
    roundStart,
  );
  const round = marketCrud.slice(roundStart, roundEnd);
  assert.ok(
    round.indexOf("applyStockRightsOffering(") <
      round.indexOf("buildStockCooldownOutboxEvents({"),
  );
});

test("운영 UI와 Query mutation은 유상증자 입력 및 두 캐시를 연결한다", () => {
  // 공용 DropdownSelect 전환 후 유형 선택지는 모듈 상수로 정의된다.
  assert.match(
    adminPanel,
    /\{ value: "RIGHTS_OFFERING", label: "유상증자" \}/,
  );
  assert.match(adminPanel, /발표 · 거래정지 시작/);
  assert.match(adminPanel, /실행 회차 추가 가격조정률/);
  assert.match(adminPanel, /실행 이후 회차에 공시 센터의 PRICE 공시/);
  assert.match(adminPanel, /유상증자를 중단하고 거래를 재개할까요/);
  assert.match(adminPanel, /후속 공시 취소/);
  assert.match(adminPanel, /parseKstDateTimeLocal/);
  assert.match(adminPanel, /\$\{value\}:00\+09:00/);
  assert.doesNotMatch(adminPanel, /getTimezoneOffset/);
  assert.match(mutationHook, /adminStockMarketKeys\.corporateActions/);
  assert.match(mutationHook, /stockDisclosureKeys\.all/);
  assert.match(mutationHook, /queryKey: stocksKeys\.all/);
  assert.match(mutationHook, /queryKey: tradeKeys\.all/);
  assert.doesNotMatch(mutationHook, /router\.refresh/);
});

test("플레이어 미공개 기업행동과 realtime 장애 read model을 안전하게 수렴시킨다", () => {
  assert.match(
    publicDisclosuresRoute,
    /publicOnly: true/,
  );
  assert.match(
    marketCrud,
    /input\.publicOnly[\s\S]*\? \["PUBLISHED"\]/,
  );
  assert.match(marketCrud, /cancellationReason: "RIGHTS_OFFERING_ANNOUNCED"/);
  assert.match(marketCrud, /companyProfileUpdate/);
  assert.match(marketCrud, /stock_company_profiles/);
  assert.match(stockQueries, /companyProfile:/);
  assert.match(stockQueries, /useStockHoldings[\s\S]*refetchInterval/);
  assert.match(stockQueries, /useStockAdminHoldings[\s\S]*refetchInterval/);
  assert.match(stockQueries, /useStockHistory[\s\S]*refetchInterval/);
  assert.match(
    adminMarketQueries,
    /useAdminStockCorporateActions[\s\S]*useRealtimeRefetchInterval[\s\S]*refetchInterval/,
  );
  assert.match(
    adminMarketQueries,
    /useAdminStockCalendar[\s\S]*useRealtimeRefetchInterval[\s\S]*refetchInterval/,
  );
  assert.match(
    disclosureQueries,
    /useAdminStockDisclosures[\s\S]*useRealtimeRefetchInterval[\s\S]*refetchInterval/,
  );
  assert.match(tradeSerializer, /cancellationReason/);
});

test("READY marker와 주요주주 payload는 worker·관리 writer 경계에서 보존된다", () => {
  assert.match(
    marketCrud,
    /claimStockMarketMigrationReady\(session\)/,
  );
  assert.match(createRoute, /claimStockMarketMigrationReady\(dbSession\)/);
  assert.match(
    adminDisclosuresRoute,
    /companyProfileUpdate: parsed\.value\.companyProfileUpdate/,
  );
  assert.match(
    adminDisclosureRoute,
    /companyProfileUpdate: current\.companyProfileUpdate/,
  );
  assert.match(
    adminDisclosureRoute,
    /companyProfileUpdate: parsed\.value\.companyProfileUpdate/,
  );
  assert.match(
    scenarioScript,
    /ownerCorporateActionId: plan\.action\.id/,
  );
  assert.match(
    marketCrud,
    /cancelCorporateActionOwnedDisclosures\(id, now, session\)/,
  );
  assert.match(
    marketCrud,
    /cancelCorporateActionOwnedDisclosures\(actionId, now, session\)/,
  );
  assert.match(marketCrud, /existing\.ownerCorporateActionId/);
  assert.equal(
    (adminDisclosureRoute.match(
      /claimStockMarketMigrationReady\(dbSession\)/g,
    ) ?? []).length,
    2,
  );
  const patchRun = adminDisclosureRoute.indexOf(
    "run: async (dbSession) =>",
  );
  const patchReady = adminDisclosureRoute.indexOf(
    "claimStockMarketMigrationReady(dbSession)",
    patchRun,
  );
  const patchRead = adminDisclosureRoute.indexOf(
    "getStockDisclosure(disclosureId",
    patchReady,
  );
  const patchWrite = adminDisclosureRoute.indexOf(
    "updateStockDisclosure(",
    patchRead,
  );
  assert.ok(
    patchRun >= 0 &&
      patchReady > patchRun &&
      patchRead > patchReady &&
      patchWrite > patchRead,
    "partial PATCH는 readiness fence 뒤 최신 문서를 읽어 병합해야 한다",
  );
  assert.match(
    marketCrud,
    /stock-disclosure:corporate-action:\$\{id\}:abort/,
  );
});
