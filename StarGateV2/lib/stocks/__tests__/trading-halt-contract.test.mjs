import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativeUrl) {
  return fs.readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const sharedType = read("../../../../packages/shared-db/src/types/stock.ts");
const sharedCrud = read("../../../../packages/shared-db/src/crud/stocks.ts");
const dbWrapper = read("../../db/stocks.ts");
const buyRoute = read("../../../app/api/erp/stocks/buy/route.ts");
const sellRoute = read("../../../app/api/erp/stocks/sell/route.ts");
const statusRoute = read(
  "../../../app/api/erp/admin/stocks/trading-status/route.ts",
);
const pricesRoute = read("../../../app/api/erp/stocks/prices/route.ts");
const serverData = read("../../../app/(erp)/erp/stock/_data.ts");
const queryHook = read("../../../hooks/queries/useStocksQuery.ts");
const mutationHook = read("../../../hooks/mutations/useStocksMutation.ts");
const adminClient = read(
  "../../../app/(erp)/erp/admin/stocks/StockAdminClient.tsx",
);
const listClient = read("../../../app/(erp)/erp/stock/StockListClient.tsx");
const tradeClient = read(
  "../../../app/(erp)/erp/stock/[ticker]/StockTradeClient.tsx",
);
const playerTradeCrud = read(
  "../../../../packages/shared-db/src/crud/trades.ts",
);
const playerTradeCreateRoute = read("../../../app/api/erp/trades/route.ts");
const playerTradeActionRoute = read(
  "../../../app/api/erp/trades/[tradeId]/route.ts",
);
const playerTradeTypes = read("../../../types/trade.ts");
const playerTradeMutations = read(
  "../../../hooks/mutations/useTradesMutation.ts",
);
const playerTradeClient = read(
  "../../../app/(erp)/erp/trades/TradesClient.tsx",
);

test("stock_prices는 migration 없이 거래정지와 매매 revision을 선택 필드로 수용한다", () => {
  assert.match(sharedType, /isTradingHalted\?: boolean/);
  assert.match(sharedType, /tradeRevision\?: number/);
  assert.match(pricesRoute, /isTradingHalted: row\?\.isTradingHalted === true/);
  assert.match(serverData, /isTradingHalted: row\?\.isTradingHalted === true/);
  assert.match(queryHook, /isTradingHalted: boolean/);
});

test("매매 claim은 transaction session에서 거래 가능한 동일 가격 문서 revision을 쓴다", () => {
  const claimStart = sharedCrud.indexOf(
    "export async function claimTradableStockPrice",
  );
  const setterStart = sharedCrud.indexOf(
    "export async function setStockTradingHalted",
  );
  const claim = sharedCrud.slice(claimStart, setterStart);

  assert.ok(claimStart >= 0, "claim CRUD 누락");
  assert.match(claim, /session: ClientSession/);
  assert.match(claim, /\{ ticker, isTradingHalted: \{ \$ne: true \} \}/);
  assert.match(claim, /\$inc: \{ tradeRevision: 1 \}/);
  assert.match(claim, /returnDocument: "after", session/);
  assert.match(claim, /existing \? "STOCK_TRADING_HALTED" : "PRICE_NOT_FOUND"/);
  assert.match(
    sharedCrud.slice(setterStart),
    /findOneAndUpdate\([\s\S]*\{ ticker \}[\s\S]*\$set: \{ isTradingHalted \}[\s\S]*session/,
  );
  assert.match(dbWrapper, /claimTradableStockPrice/);
  assert.match(dbWrapper, /setStockTradingHalted/);
});

test("매수와 매도는 transaction 밖 가격 read 없이 claim 후 경제 mutation을 수행하고 423을 반환한다", () => {
  for (const [label, source, economicMutation] of [
    ["buy", buyRoute, "await addCredit("],
    ["sell", sellRoute, "await sellHolding("],
  ]) {
    assert.doesNotMatch(source, /getStockPrice/);
    const runIndex = source.indexOf("run: async (mongoSession)");
    const claimIndex = source.indexOf(
      "await claimTradableStockPrice(ticker, mongoSession)",
      runIndex,
    );
    const mutationIndex = source.indexOf(economicMutation, claimIndex);
    assert.ok(runIndex >= 0, `${label} economic transaction 누락`);
    assert.ok(claimIndex > runIndex, `${label} transaction 내부 claim 누락`);
    assert.ok(mutationIndex > claimIndex, `${label} claim 전 경제 mutation 금지`);
    assert.match(source, /err instanceof StockPriceTradeClaimError/);
    assert.match(source, /code: err\.code[\s\S]*status: 423/);
  }
});

test("GM 거래상태 API는 멱등 transaction 안에서 상태와 감사 outbox를 함께 저장한다", () => {
  const roleIndex = statusRoute.indexOf('requireRole(session.user.role, "GM")');
  const keyIndex = statusRoute.indexOf("readIdempotencyKey(request)");
  const operationIndex = statusRoute.indexOf(
    "executeEconomicOperationResult<TradingStatusOperationBody>",
  );
  const statusIndex = statusRoute.indexOf("await setStockTradingHalted(");
  const auditIndex = statusRoute.indexOf("await enqueueGmAdminAudit(");
  const completionIndex = statusRoute.indexOf("return {", auditIndex);

  assert.ok(roleIndex >= 0, "GM 권한 검증 누락");
  assert.ok(keyIndex > roleIndex, "Idempotency-Key 검증 누락");
  assert.ok(operationIndex > keyIndex, "멱등 transaction 누락");
  assert.ok(statusIndex > operationIndex, "상태 변경이 transaction 밖에 있음");
  assert.ok(auditIndex > statusIndex, "상태 변경 뒤 감사 outbox 누락");
  assert.ok(completionIndex > auditIndex, "감사 저장 전 operation 완료 금지");
  assert.match(statusRoute.slice(statusIndex), /dbSession/);
  assert.match(statusRoute.slice(auditIndex), /session: dbSession/);
  assert.match(statusRoute, /if \(!result\) throw new StockTradingStatusTargetError/);
  assert.doesNotMatch(statusRoute, /Webhook|Discord/i);
});

test("query와 세 UI는 개별 거래정지 상태 및 stale 423 복구 흐름을 연결한다", () => {
  assert.match(queryHook, /\| "STOCK_TRADING_HALTED"/);
  assert.match(
    queryHook,
    /fetch\("\/api\/erp\/stocks\/prices", \{ cache: "no-store" \}\)/,
  );
  assert.match(mutationHook, /fetch\("\/api\/erp\/admin\/stocks\/trading-status"/);
  assert.match(
    mutationHook,
    /useUpdateStockTradingStatus[\s\S]*setQueryData<StockPricesResponse>[\s\S]*isTradingHalted: data\.item\.isTradingHalted[\s\S]*invalidateQueries\(\{ queryKey: stocksKeys\.prices \}\)/,
  );
  const haltedInvalidations = mutationHook.match(
    /err\.code === "STOCK_TRADING_HALTED"[\s\S]{0,160}stocksKeys\.prices/g,
  );
  assert.equal(haltedInvalidations?.length, 2, "buy/sell stale 423 prices invalidation 누락");
  assert.match(adminClient, /useUpdateStockTradingStatus/);
  assert.match(
    adminClient,
    /selected\.isTradingHalted[\s\S]{0,100}\? "거래정지"[\s\S]{0,100}: "거래 가능"/,
  );
  assert.match(adminClient, /retainIdempotencyOperation\([\s\S]*"stock-trading-status"/);
  assert.match(listClient, /item\.isTradingHalted[\s\S]*거래정지/);
  assert.match(tradeClient, /const isTradingHalted = currentPrice\?\.isTradingHalted \?\? false/);
  assert.match(tradeClient, /const canTrade =[\s\S]*!isTradingHalted/);
  assert.match(tradeClient, /이 종목은 운영자에 의해 거래정지되었습니다/);
});

test("플레이어 자산 교환도 모든 종목을 자산 mutation 전에 claim하고 423으로 전파한다", () => {
  const settleStart = playerTradeCrud.indexOf("async function settleTrade(");
  const claimIndex = playerTradeCrud.indexOf(
    "await claimTradableOfferStocks(",
    settleStart,
  );
  const inventoryLockIndex = playerTradeCrud.indexOf(
    "await lockCharacterInventoryItems(",
    settleStart,
  );
  const transferIndex = playerTradeCrud.indexOf(
    "await transferOffer(",
    settleStart,
  );

  assert.ok(settleStart >= 0, "player trade settle 경계 누락");
  assert.ok(claimIndex > settleStart, "player trade stock claim 누락");
  assert.ok(
    inventoryLockIndex > claimIndex && transferIndex > inventoryLockIndex,
    "stock claim 전 자산 mutation 금지",
  );
  assert.match(
    playerTradeCrud,
    /new Set\([\s\S]*initiatorOffer\.stocks[\s\S]*counterpartyOffer\.stocks[\s\S]*\.sort\(/,
  );
  assert.match(
    playerTradeCrud,
    /await claimTradableStockPrice\(ticker, session\)/,
  );
  assert.match(
    playerTradeCrud,
    /"STOCK_TRADING_HALTED"[\s\S]*현재 거래정지 상태/,
  );
  for (const route of [playerTradeCreateRoute, playerTradeActionRoute]) {
    assert.match(
      route,
      /error\.code === "STOCK_TRADING_HALTED"[\s\S]{0,80}\? 423/,
    );
  }
});

test("OPEN 제안 저장과 첫 확정도 거래 가능한 종목만 같은 transaction에서 허용한다", () => {
  const createStart = playerTradeCrud.indexOf(
    "export async function createOpenPlayerTrade(",
  );
  const giftStart = playerTradeCrud.indexOf(
    "export async function createAndSettleGift(",
  );
  const create = playerTradeCrud.slice(createStart, giftStart);
  assert.ok(
    create.indexOf("await claimTradableOfferStocks(") <
      create.indexOf("insertOne(doc, { session })"),
    "OPEN 생성 전에 종목 claim 필요",
  );

  const replaceStart = playerTradeCrud.indexOf(
    "export async function replacePlayerTradeOffer(",
  );
  const confirmStart = playerTradeCrud.indexOf(
    "export async function confirmPlayerTrade(",
  );
  const replace = playerTradeCrud.slice(replaceStart, confirmStart);
  assert.match(
    replace,
    /await claimTradableOfferStocks\(\s*validated\.offer,\s*EMPTY_PLAYER_TRADE_OFFER,\s*session/,
    "제안 교체는 상대 정지 종목과 무관하게 본인 새 제안만 claim해야 함",
  );
  assert.ok(
    replace.indexOf("await claimTradableOfferStocks(") <
      replace.indexOf("findOneAndUpdate("),
    "제안 교체 저장 전에 본인 새 제안 종목 claim 필요",
  );

  const cancelStart = playerTradeCrud.indexOf(
    "export async function cancelPlayerTrade(",
  );
  const confirm = playerTradeCrud.slice(confirmStart, cancelStart);
  const firstConfirmationStart = confirm.indexOf("if (!otherConfirmed)");
  assert.ok(firstConfirmationStart >= 0, "첫 확정 분기 누락");
  assert.ok(
    confirm.indexOf("await claimTradableOfferStocks(", firstConfirmationStart) <
      confirm.indexOf("findOneAndUpdate(", firstConfirmationStart),
    "첫 확정 저장 전에 양측 종목 claim 필요",
  );
});

test("플레이어 거래 응답과 화면은 양측 OPEN 제안 상태까지 수렴시킨다", () => {
  assert.match(playerTradeTypes, /isTradingHalted: boolean/);
  assert.match(playerTradeTypes, /isSeeded: boolean/);
  assert.match(playerTradeTypes, /stockAvailability: PlayerTradeStockAvailability\[\]/);
  assert.match(playerTradeCreateRoute, /getStockPrices\(\)/);
  assert.match(
    playerTradeCreateRoute,
    /isTradingHalted: price\?\.isTradingHalted === true/,
  );
  assert.match(
    playerTradeCreateRoute,
    /openOfferTickers[\s\S]*initiatorOffer\.stocks[\s\S]*counterpartyOffer\.stocks[\s\S]*stockAvailability/,
  );
  assert.match(
    playerTradeClient,
    /availabilityByTicker[\s\S]*tradeOfferTokenUnavailable/,
  );
  assert.match(
    playerTradeClient,
    /hasUnavailableOfferStock[\s\S]*disabled=\{busy \|\| myConfirmed \|\| hasUnavailableOfferStock\}/,
  );
  assert.match(
    playerTradeClient,
    /hasUnavailableSelectedStock[\s\S]*거래 불가 종목을 전송 구성에서 제거/,
  );
  assert.doesNotMatch(
    playerTradeClient,
    /unavailableOfferBlocked/,
    "상대 정지 종목 때문에 본인 제안 복구를 막으면 안 됨",
  );
  assert.match(
    playerTradeMutations,
    /error\.code !== "STOCK_TRADING_HALTED"[\s\S]*tradeKeys\.all[\s\S]*stocksKeys\.prices/,
  );
  assert.match(
    mutationHook,
    /useUpdateStockTradingStatus[\s\S]*tradeKeys\.all/,
  );
});
