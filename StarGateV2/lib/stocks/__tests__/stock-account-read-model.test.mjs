import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

function read(relativeUrl) {
  return fs.readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const querySource = read("../../../hooks/queries/useStocksQuery.ts");
const creditsQuerySource = read("../../../hooks/queries/useCreditsQuery.ts");
const mutationSource = read("../../../hooks/mutations/useStocksMutation.ts");
const listPage = read("../../../app/(erp)/erp/stock/page.tsx");
const listClient = read("../../../app/(erp)/erp/stock/StockListClient.tsx");
const tickerPage = read("../../../app/(erp)/erp/stock/[ticker]/page.tsx");
const tickerClient = read(
  "../../../app/(erp)/erp/stock/[ticker]/StockTradeClient.tsx",
);
const portfolioPage = read(
  "../../../app/(erp)/erp/stock/portfolio/page.tsx",
);
const portfolioClient = read(
  "../../../app/(erp)/erp/stock/portfolio/StockPortfolioClient.tsx",
);
const dbSource = read("../../db/stock-account.ts");
const balanceRoute = read(
  "../../../app/api/erp/credits/balance/route.ts",
);
const ledgerRoute = read("../../../app/api/erp/stocks/ledger/route.ts");
const realizedProfitRoute = read(
  "../../../app/api/erp/stocks/realized-profit/route.ts",
);

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test("주식 화면은 전체 credits 응답 대신 화면별 read model만 시드한다", () => {
  for (const source of [listClient, tickerClient, portfolioClient]) {
    assert.doesNotMatch(source, /useCredits\s*\(/);
    assert.doesNotMatch(source, /CreditsResponse/);
  }

  assert.match(listPage, /buildStockBalanceResponse\(mainCharacterId\)/);
  assert.doesNotMatch(listPage, /buildStockLedgerResponse|buildStockRealizedProfitResponse/);

  assert.match(tickerPage, /buildStockBalanceResponse\(mainCharacterId\)/);
  assert.match(
    tickerPage,
    /buildStockLedgerResponse\(mainCharacterId, ticker\)/,
  );
  assert.doesNotMatch(tickerPage, /buildStockRealizedProfitResponse/);

  assert.match(portfolioPage, /buildStockBalanceResponse\(mainCharacterId\)/);
  assert.match(
    portfolioPage,
    /buildStockRealizedProfitResponse\(mainCharacterId\)/,
  );
  assert.doesNotMatch(portfolioPage, /buildStockLedgerResponse/);
});

test("RSC read 실패는 fresh 0/빈 응답으로 숨기지 않고 해당 query의 mount 복구를 허용한다", () => {
  assert.match(
    listPage,
    /buildStockBalanceResponse\(mainCharacterId\)\.catch\([\s\S]*undefined/,
  );
  assert.match(
    tickerPage,
    /buildStockBalanceResponse\(mainCharacterId\)\.catch\([\s\S]*undefined/,
  );
  assert.match(
    tickerPage,
    /buildStockLedgerResponse\(mainCharacterId, ticker\)\.catch\([\s\S]*undefined/,
  );
  assert.match(
    portfolioPage,
    /buildStockRealizedProfitResponse\(mainCharacterId\)\.catch\([\s\S]*undefined/,
  );
  for (const client of [listClient, tickerClient, portfolioClient]) {
    assert.match(client, /balanceQuery\.isError/);
    assert.match(
      client,
      /balanceQuery\.isError[\s\S]{0,80}\? null[\s\S]{0,120}balanceQuery\.data/,
    );
  }
  assert.match(
    portfolioClient,
    /realizedProfitQuery\.isError[\s\S]{0,80}\? null[\s\S]{0,120}realizedProfitQuery\.data/,
  );
  assert.match(
    tickerClient,
    /const canTrade =[\s\S]*balance !== null[\s\S]*!ledgerQuery\.isError/,
  );
});

test("세 read model query는 credits prefix 하위의 서로 다른 shape와 endpoint를 사용한다", () => {
  assert.match(
    creditsQuerySource,
    /balance: \(characterId: string\)[\s\S]*"credits", "balance", characterId/,
  );
  assert.match(
    querySource,
    /ledger: \(characterId: string, ticker: string\)[\s\S]*"ledger", characterId, ticker/,
  );
  assert.match(
    querySource,
    /realizedProfit: \(characterId: string\)[\s\S]*"realized-profit", characterId/,
  );
  assert.match(querySource, /return useCreditBalance\(characterId, options\)/);
  assert.match(
    creditsQuerySource,
    /fetch\("\/api\/erp\/credits\/balance"/,
  );
  assert.match(querySource, /\/api\/erp\/stocks\/ledger\?ticker=/);
  assert.match(querySource, /fetch\("\/api\/erp\/stocks\/realized-profit"\)/);
  assert.match(querySource, /data\.characterId !== expectedCharacterId/);
  assert.match(querySource, /options\.initialData\.characterId === characterId/);
});

test("RSC initialData는 cold mount GET을 막고 credits prefix invalidation은 활성 query를 갱신한다", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const calls = { balance: 0, ledger: 0, realized: 0 };
  const configs = [
    {
      key: ["credits", "balance", "character-1"],
      initialData: { balance: 10 },
      queryFn: async () => ({ balance: ++calls.balance }),
    },
    {
      key: ["credits", "stocks", "ledger", "character-1", "STM"],
      initialData: { items: [{ id: "seed" }] },
      queryFn: async () => ({ items: [{ id: `fresh-${++calls.ledger}` }] }),
    },
    {
      key: ["credits", "stocks", "realized-profit", "character-1"],
      initialData: { realizedProfit: 7 },
      queryFn: async () => ({ realizedProfit: ++calls.realized }),
    },
  ];

  const observers = configs.map(
    (config) =>
      new QueryObserver(queryClient, {
        queryKey: config.key,
        queryFn: config.queryFn,
        initialData: config.initialData,
        staleTime: 5 * 60 * 1000,
      }),
  );
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  await tick();
  assert.deepEqual(calls, { balance: 0, ledger: 0, realized: 0 });

  await queryClient.invalidateQueries({ queryKey: ["credits"] });
  await tick();
  assert.deepEqual(calls, { balance: 1, ledger: 1, realized: 1 });

  for (const unsubscribe of unsubscribes) unsubscribe();
  queryClient.clear();
});

test("ticker 원장은 서버에서 해당 ticker 최근 5건만 결정적으로 조회한다", () => {
  assert.match(dbSource, /characterId,/);
  assert.match(dbSource, /type: \{ \$in: \["STOCK_BUY", "STOCK_SELL"\] \}/);
  assert.match(dbSource, /"metadata\.ticker": ticker/);
  assert.match(dbSource, /\.sort\(\{ createdAt: -1, _id: -1 \}\)/);
  assert.match(dbSource, /\.limit\(limit\)/);
  assert.match(ledgerRoute, /listRecentStockLedger\(character\.characterId, ticker, 5\)/);
});

test("실현손익은 전체 STOCK_SELL 중 숫자 profit만 합계하고 포함·전체 건수를 노출한다", () => {
  assert.match(dbSource, /\$match: \{ characterId, type: "STOCK_SELL" \}/);
  assert.match(dbSource, /\$isNumber: "\$metadata\.profit"/);
  assert.match(dbSource, /countedSales/);
  assert.match(dbSource, /totalSales/);
  assert.match(realizedProfitRoute, /getStockRealizedProfitSummary\(character\.characterId\)/);
  assert.match(
    portfolioClient,
    /realizedProfitData\?\.countedSales === realizedProfitData\?\.totalSales/,
  );
  assert.match(portfolioClient, /realizedProfitData\?\.realizedProfit/);
  assert.match(portfolioClient, /"원장 확인 필요"/);
});

test("read API는 인증된 세션 소유 캐릭터만 해석하고 외부 characterId 입력을 받지 않는다", () => {
  for (const source of [balanceRoute, ledgerRoute, realizedProfitRoute]) {
    assert.match(source, /const session = await auth\(\)/);
    assert.match(source, /resolveOwnedCreditCharacter\(\s*session\.user/);
    assert.doesNotMatch(source, /searchParams\.get\("characterId"\)/);
    assert.doesNotMatch(source, /request\.json\(\)/);
    assert.match(source, /MAIN_CHARACTER_INTEGRITY/);
    assert.match(source, /private, no-store/);
  }
});

test("매수·매도 성공과 복구 오류는 기존 credits prefix invalidation을 유지한다", () => {
  const invalidations = mutationSource.match(
    /invalidateQueries\(\{ queryKey: creditKeys\.all \}\)/g,
  );
  assert.ok((invalidations?.length ?? 0) >= 4);
  assert.match(mutationSource, /REFUND_AFFECTING_CODES/);
});
