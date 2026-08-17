import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const repoDir = resolve(rootDir, "..");

function source(path) {
  return readFileSync(resolve(rootDir, path), "utf8");
}

test("예약 생성·취소는 경제 operation과 GM 감사 outbox를 같은 transaction에 둔다", () => {
  const createRoute = source("app/api/erp/admin/stocks/events/route.ts");
  const cancelRoute = source(
    "app/api/erp/admin/stocks/events/[eventId]/route.ts",
  );

  for (const route of [createRoute, cancelRoute]) {
    assert.match(route, /requireRole\(session\.user\.role, "GM"\)/);
    assert.match(route, /readIdempotencyKey\(request\)/);
    assert.match(
      route,
      /executeEconomicOperationResult[\s\S]*run: async \(dbSession\)[\s\S]*enqueueGmAdminAudit[\s\S]*session: dbSession/,
    );
  }
  assert.match(createRoute, /isNovexV2Enabled\(\)[\s\S]*status: 409/);
  assert.doesNotMatch(cancelRoute, /isNovexV2Enabled\(\)/);
  assert.match(createRoute, /listScheduledStockMarketEvents\(\)[\s\S]*builtInConflict/);
  assert.match(
    createRoute,
    /run: async \(dbSession\)[\s\S]*const transactionNow = new Date\(\)[\s\S]*fenceStockScheduledEventCreation[\s\S]*createStockScheduledEvent/,
  );
  const executorStart = createRoute.indexOf(
    "executeEconomicOperationResult<CreateEventOperationBody>",
  );
  assert.ok(executorStart > 0);
  const beforeIdempotencyReplay = createRoute.slice(0, executorStart);
  assert.match(beforeIdempotencyReplay, /if \(!executeAt\)/);
  assert.doesNotMatch(
    beforeIdempotencyReplay,
    /executeAt\.getTime\(\)\s*<=/,
  );
});

test("예약 lifecycle은 ticker/date 결정 ID와 PENDING 조건부 claim·cancel을 사용한다", () => {
  const database = readFileSync(
    resolve(repoDir, "packages/shared-db/src/crud/stock-scheduled-events.ts"),
    "utf8",
  );

  assert.match(database, /`stock-event:\$\{kstDate\}:\$\{ticker\}`/);
  assert.match(
    database,
    /claimPendingStockScheduledEvent[\s\S]*status: "PENDING"[\s\S]*executeAt: \{ \$lte: input\.now \}[\s\S]*status: "APPLIED"[\s\S]*session: input\.session/,
  );
  assert.match(
    database,
    /fenceStockScheduledEventCreation[\s\S]*CUTOFF_REACHED[\s\S]*stock_prices[\s\S]*scheduledEventRevision[\s\S]*session: input\.session/,
  );
  assert.match(
    database,
    /cancelStockScheduledEvent[\s\S]*status: "PENDING"[\s\S]*status: "CANCELLED"[\s\S]*session: input\.session/,
  );
  assert.match(
    database,
    /reactivateMigratedDisclosure[\s\S]*fenceMigratedDisclosure[\s\S]*status: "SCHEDULED"/,
  );
  assert.match(
    database,
    /cancelMigratedDisclosure[\s\S]*fenceMigratedDisclosure[\s\S]*status: "CANCELLED"/,
  );
  assert.match(
    database,
    /fenceStockScheduledEventCutover[\s\S]*operation === "CREATE"[\s\S]*"PRE_MIGRATION"[\s\S]*\$in: \["PRE_MIGRATION", "READY"\][\s\S]*legacyWriterRevision/,
  );
  assert.match(
    database,
    /createStockScheduledEvent[\s\S]*fenceStockScheduledEventCutover\(\{[\s\S]*operation: "CREATE"/,
  );
  assert.match(
    database,
    /cancelStockScheduledEvent[\s\S]*fenceStockScheduledEventCutover\(\{[\s\S]*operation: "CANCEL"/,
  );
  assert.match(
    database,
    /const \[pending, history\] = await Promise\.all\([\s\S]*find\(\{ status: "PENDING" \}\)[\s\S]*status: \{ \$in: \["APPLIED", "CANCELLED"\] \}[\s\S]*limit\(historyLimit\)/,
  );

  const indexes = readFileSync(
    resolve(repoDir, "packages/shared-db/src/indexes.ts"),
    "utf8",
  );
  assert.match(
    indexes,
    /collection\("stock_scheduled_events"\)\.createIndex\([\s\S]*status: 1, executeAt: 1, ticker: 1[\s\S]*stock_scheduled_events_status_executeAt_ticker/,
  );
});

test("legacy 예약 API는 NOVEX cutover writer 거부를 안정적인 409로 매핑한다", () => {
  const createRoute = source("app/api/erp/admin/stocks/events/route.ts");
  const cancelRoute = source(
    "app/api/erp/admin/stocks/events/[eventId]/route.ts",
  );
  for (const route of [createRoute, cancelRoute]) {
    assert.match(
      route,
      /error instanceof StockScheduledEventCutoverError[\s\S]*status: 409/,
    );
  }
});

test("NOVEX migration은 writer claim 직후 plan을 재검사하고 drift를 BLOCKED로 남긴다", () => {
  const migration = readFileSync(
    resolve(
      repoDir,
      "packages/shared-db/src/migrations/novex-2-transition.ts",
    ),
    "utf8",
  );
  assert.match(
    migration,
    /claimNovex2MigrationReadiness[\s\S]*fencedPlan = await inspectNovex2Migration\(db, inspectedAt\)[\s\S]*NOVEX_MIGRATION_PLAN_CHANGED_AFTER_CLAIM/,
  );
  assert.match(
    migration,
    /attemptId,[\s\S]*sourcePlanFingerprint: actualPlanFingerprint[\s\S]*status: "BLOCKED"[\s\S]*blockedPlanFingerprint: fencedPlanFingerprint/,
  );
});

test("정기 tick은 예약 이벤트 claim 뒤에만 소다 보정을 소비한다", () => {
  const operation = readFileSync(
    resolve(repoDir, "packages/core/src/operations/stocks-tick.ts"),
    "utf8",
  );
  assert.match(
    operation,
    /const claimed = await claimScheduledEvent[\s\S]*if \(claimed\)[\s\S]*scheduledEvent[\s\S]*consumeStockImpact/,
  );
  assert.match(operation, /const loadContext = !options\.force/);
  assert.match(
    operation,
    /!options\.force && now\.getTime\(\) < executeAt\.getTime\(\)[\s\S]*ScheduledStockTickNotDueError/,
  );
});

test("예약 Query는 전용 캐시를 무효화하고 실시간 가격 cache로 미리보기를 갱신한다", () => {
  const query = source("hooks/queries/useStockScheduledEventsQuery.ts");
  const mutation = source("hooks/mutations/useStockScheduledEventsMutation.ts");
  const page = source("app/(erp)/erp/admin/stocks/page.tsx");
  const adminClient = source(
    "app/(erp)/erp/admin/stocks/StockAdminClient.tsx",
  );
  const scheduledPanel = source(
    "app/(erp)/erp/admin/stocks/StockScheduledEventsPanel.tsx",
  );

  assert.match(query, /\["stocks", "scheduled-events"\]/);
  assert.equal(
    mutation.match(/invalidateQueries\(\{ queryKey: stockScheduledEventsKeys\.all \}\)/g)
      ?.length,
    2,
  );
  assert.doesNotMatch(page, /StockScheduledEventsPanel/);
  assert.match(adminClient, /<StockScheduledEventsPanel stocks=\{prices\.items\} \/>/);
  assert.match(scheduledPanel, /현재가 기준 예상가/);
});
