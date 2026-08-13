import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("shop query는 티켓 종류별 수량과 사죄 보상 상태 계약을 제공한다", async () => {
  const queries = await readWeb("hooks/queries/useShopQuery.ts");

  assert.match(queries, /availableTickets: number/);
  assert.match(
    queries,
    /ticketCounts: \{[\s\S]*mrbeast_lottery: number[\s\S]*mrbeast_apology_lottery: number/,
  );
  assert.match(
    queries,
    /status: "ELIGIBLE" \| "INELIGIBLE" \| "CLAIMED"[\s\S]*purchasedQuantity: number[\s\S]*rewardQuantity: number[\s\S]*claimedAt: string \| null/,
  );
  assert.match(queries, /payback: \["shop", "payback"\]/);
  assert.match(
    queries,
    /fetch\("\/api\/erp\/shop\/payback", \{ cache: "no-store" \}\)/,
  );
  assert.match(queries, /export function useShopPayback/);
});

test("복권 시작은 선택 티켓을 보내고 사죄 보상 수령은 영향 캐시를 모두 갱신한다", async () => {
  const mutations = await readWeb("hooks/mutations/useShopMutation.ts");

  assert.match(
    mutations,
    /ticketSlug: input\.ticketSlug \?\? MRBEAST_LOTTERY_SLUG/,
  );
  assert.match(mutations, /export function useClaimMrBeastSodaPayback/);
  assert.match(mutations, /fetch\("\/api\/erp\/shop\/payback"/);
  assert.match(
    mutations,
    /"Idempotency-Key": createIdempotencyKey\([\s\S]*"shop-mrbeast-soda-payback"/,
  );
  assert.match(
    mutations,
    /body: JSON\.stringify\(\{[\s\S]*expectedCharacterId: input\.expectedCharacterId/,
  );

  const paybackHook = mutations.slice(
    mutations.indexOf("export function useClaimMrBeastSodaPayback"),
    mutations.indexOf("export function useRevealMrBeastLotteryClaim"),
  );
  assert.match(paybackHook, /shopKeys\.payback/);
  assert.match(paybackHook, /shopKeys\.lottery/);
  assert.match(paybackHook, /shopKeys\.inventory/);
  assert.match(
    paybackHook,
    /inventoryKeys\.byCharacter\(input\.expectedCharacterId\)/,
  );
  assert.match(paybackHook, /notificationKeys\.all/);
});

test("사죄 보상 UI는 영업·이벤트 상태와 독립적으로 모든 조회 상태를 처리한다", async () => {
  const [client, styles] = await Promise.all([
    readWeb("app/(erp)/erp/shop/ShopClient.tsx"),
    readWeb("app/(erp)/erp/shop/page.module.css"),
  ]);

  const promotion = client.indexOf("lotteryPromotion");
  const payback = client.indexOf("showPaybackSection ?");
  const winners = client.indexOf("lotteryState?.enabled && lotteryState.recentWinners");
  const closedBranch = client.indexOf("{!catalog.isOpen ?", payback);
  assert.ok(promotion >= 0 && payback > promotion);
  assert.ok(winners > payback);
  assert.ok(closedBranch > payback);

  assert.match(client, /paybackQuery\.isPending/);
  assert.match(client, /paybackQuery\.isError/);
  assert.match(client, /paybackQuery\.refetch\(\)/);
  assert.match(client, /paybackState\?\.status === "ELIGIBLE"/);
  assert.match(client, /paybackState\?\.status === "CLAIMED"/);
  assert.match(client, /보상 수령 완료/);
  assert.match(client, /disabled=\{claimPaybackMutation\.isPending\}/);
  assert.match(client, /paybackQuery\.error\.message/);
  assert.match(client, /setErrorMessage\(error\.message\)/);
  assert.doesNotMatch(
    client.slice(
      client.indexOf("const showPaybackSection"),
      client.indexOf("const {", client.indexOf("const showPaybackSection")),
    ),
    /INELIGIBLE/,
  );
  assert.match(styles, /\.paybackSection \{[\s\S]*z-index: 3/);
  assert.match(
    styles,
    /@media \(max-width: 720px\)[\s\S]*\.paybackSection \{[\s\S]*grid-template-columns: 1fr/,
  );
});

test("shop과 스크래치 모달은 pending 우선·사죄 티켓 우선 표시를 유지한다", async () => {
  const [client, modal] = await Promise.all([
    readWeb("app/(erp)/erp/shop/ShopClient.tsx"),
    readWeb("app/(erp)/erp/shop/MrBeastLotteryModal.tsx"),
  ]);

  assert.match(
    client,
    /lotteryState\?\.pendingClaim\?\.ticketSlug \?\?[\s\S]*ticketCounts\?\.mrbeast_apology_lottery/,
  );
  assert.match(client, /ticketSlug: selectedLotteryTicketSlug/);
  assert.match(client, /MRBEAST_APOLOGY_LOTTERY_SRC/);
  assert.match(client, /tone: "success"[\s\S]*사죄 복권/);

  assert.match(
    modal,
    /claim\.ticketSlug === MRBEAST_APOLOGY_LOTTERY_SLUG/,
  );
  assert.match(modal, /MRBEAST_APOLOGY_LOTTERY_SRC/);
  assert.match(modal, /MRBEAST_APOLOGY_LOTTERY_NAME/);
  assert.match(modal, /2등 이상 당첨 확률 10배/);
  assert.match(modal, /src=\{lotteryImageSrc\}/);
  assert.match(modal, /<h2 id=\{titleId\}>\{lotteryName\}<\/h2>/);
});
