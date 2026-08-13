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
  assert.match(createRoute, /listScheduledStockMarketEvents\(\)[\s\S]*builtInConflict/);
  assert.match(
    createRoute,
    /run: async \(dbSession\)[\s\S]*const transactionNow = new Date\(\)[\s\S]*fenceStockScheduledEventCreation[\s\S]*createStockScheduledEvent/,
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

test("예약 Query는 생성·취소 성공 뒤 전용 캐시를 무효화한다", () => {
  const query = source("hooks/queries/useStockScheduledEventsQuery.ts");
  const mutation = source("hooks/mutations/useStockScheduledEventsMutation.ts");
  const page = source("app/(erp)/erp/admin/stocks/page.tsx");

  assert.match(query, /\["stocks", "scheduled-events"\]/);
  assert.equal(
    mutation.match(/invalidateQueries\(\{ queryKey: stockScheduledEventsKeys\.all \}\)/g)
      ?.length,
    2,
  );
  assert.match(page, /<StockScheduledEventsPanel/);
});
