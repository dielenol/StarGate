import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

const ROOT = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test("전체 원장과 잔액 캐시는 credits prefix 아래의 서로 다른 shape로 격리한다", async () => {
  const query = await source("hooks/queries/useCreditsQuery.ts");

  assert.match(query, /full: \["credits", "full"\]/);
  assert.match(
    query,
    /balance: \(characterId: string\)[\s\S]*\["credits", "balance", characterId\]/,
  );
  assert.match(query, /queryKey: creditKeys\.full/);
  assert.match(query, /queryKey: creditKeys\.balance\(characterId \?\? "missing"\)/);
  assert.match(query, /data\.characterId !== expectedCharacterId/);
  assert.match(query, /data\.characterId === characterId/);
});

test("편의점과 병기부는 표시하지 않는 원장을 읽거나 full cache를 seed하지 않는다", async () => {
  const [shopPage, shopClient, equipmentData, equipmentClient] =
    await Promise.all([
      source("app/(erp)/erp/shop/page.tsx"),
      source("app/(erp)/erp/shop/ShopClient.tsx"),
      source("app/(erp)/erp/equipment-shop/_data.ts"),
      source("app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx"),
    ]);

  for (const page of [shopPage, equipmentData]) {
    assert.doesNotMatch(page, /listCreditTransactions/);
    assert.doesNotMatch(page, /initialLedger/);
  }
  for (const client of [shopClient, equipmentClient]) {
    assert.match(client, /useCreditBalance/);
    assert.doesNotMatch(client, /useCredits\s*\(/);
    assert.doesNotMatch(client, /CreditsResponse/);
    assert.match(client, /balanceQuery\.isError/);
    assert.match(
      client,
      /if \(balanceQuery\.isError\) return null;[\s\S]{0,80}if \(balanceQuery\.data\)/,
    );
    assert.doesNotMatch(
      client,
      /if \(balanceQuery\.data\) return balanceQuery\.data\.balance;[\s\S]{0,80}initialBalance \?\? 0/,
    );
  }
});

test("credits root invalidation은 full·balance·stock 파생 query를 모두 갱신한다", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const calls = { full: 0, balance: 0, realized: 0 };
  const observers = [
    new QueryObserver(client, {
      queryKey: ["credits", "full"],
      queryFn: async () => ({ transactions: [], call: ++calls.full }),
      initialData: { transactions: [] },
      staleTime: 300_000,
    }),
    new QueryObserver(client, {
      queryKey: ["credits", "balance", "character-1"],
      queryFn: async () => ({ balance: ++calls.balance }),
      initialData: { balance: 42 },
      staleTime: 300_000,
    }),
    new QueryObserver(client, {
      queryKey: ["credits", "stocks", "realized-profit", "character-1"],
      queryFn: async () => ({ realizedProfit: ++calls.realized }),
      initialData: { realizedProfit: 7 },
      staleTime: 300_000,
    }),
  ];
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  await tick();
  assert.deepEqual(calls, { full: 0, balance: 0, realized: 0 });

  await client.invalidateQueries({ queryKey: ["credits"] });
  await tick();
  assert.deepEqual(calls, { full: 1, balance: 1, realized: 1 });

  for (const unsubscribe of unsubscribes) unsubscribe();
  client.clear();
});

test("경제 read API는 정합성 예외와 일시 조회 실패를 구분하고 오류 원문을 숨긴다", async () => {
  const [characters, resolver, balance, ledger, realized] = await Promise.all([
    source("../packages/shared-db/src/crud/characters.ts"),
    source("lib/credits/account-read.ts"),
    source("app/api/erp/credits/balance/route.ts"),
    source("app/api/erp/stocks/ledger/route.ts"),
    source("app/api/erp/stocks/realized-profit/route.ts"),
  ]);

  assert.match(characters, /export class MainCharacterIntegrityError/);
  assert.match(resolver, /error instanceof MainCharacterIntegrityError/);
  assert.match(resolver, /status: "lookup-error"/);
  for (const route of [balance, ledger, realized]) {
    assert.match(route, /character\.status === "lookup-error"/);
    assert.doesNotMatch(route, /NextResponse\.json\(\{ error: message \}/);
  }
});
