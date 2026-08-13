import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../", import.meta.url);
const REPO_ROOT = new URL("../../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("checkout과 페이백 claim은 같은 사용자 anchor로 counter 전후를 직렬화한다", async () => {
  const [checkout, paybackDb, paybackRoute] = await Promise.all([
    readWeb("app/api/erp/shop/checkout/route.ts"),
    readWeb("lib/db/mrbeast-soda-payback.ts"),
    readWeb("app/api/erp/shop/payback/route.ts"),
  ]);

  assert.match(
    checkout,
    /prepareMrBeastSodaPaybackAnchor\(session\.user\.id\)[\s\S]*executeEconomicOperation/,
  );
  assert.match(
    checkout,
    /sodaPaybackPurchaseEligible[\s\S]*isMrBeastSodaApologyPaybackDateEligible/,
  );
  assert.match(
    checkout,
    /fenceLotteryCharacterOwner[\s\S]*fenceMrBeastSodaPayback[\s\S]*incrementMrBeastSodaDailyPurchaseCounter/,
  );
  assert.match(
    paybackDb,
    /paybackId\(userId: string\)[\s\S]*MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID[\s\S]*userId/,
  );
  assert.match(
    paybackDb,
    /claimMrBeastSodaPayback[\s\S]*fenceMrBeastSodaPayback[\s\S]*calculateCurrentPayback[\s\S]*claimedAt: \{ \$exists: false \}/,
  );
  assert.match(
    paybackRoute,
    /executeEconomicOperation\([\s\S]*domain: "shop-mrbeast-soda-payback"[\s\S]*fenceLotteryCharacterOwner[\s\S]*claimMrBeastSodaPayback/,
  );
});

test("페이백은 신규 복권 권리·mirror·알림을 같은 transaction session에서 확정한다", async () => {
  const [paybackDb, lotteryDb] = await Promise.all([
    readWeb("lib/db/mrbeast-soda-payback.ts"),
    readWeb("lib/db/mrbeast-lottery.ts"),
  ]);

  assert.match(paybackDb, /MRBEAST_APOLOGY_LOTTERY_SLUG/);
  assert.match(paybackDb, /grantMrBeastLotteryTickets\([\s\S]*session: input\.session/);
  assert.match(
    paybackDb,
    /NOTIFICATIONS_COLLECTION[\s\S]*insertOne\([\s\S]*dedupeKey:[\s\S]*\{ session: input\.session \}/,
  );
  assert.match(
    lotteryDb,
    /ticketSlug: input\.ticketSlug[\s\S]*addToInventory\([\s\S]*session: input\.session[\s\S]*reconcileTicketInventoryMirror/,
  );
  assert.match(lotteryDb, /offset < input\.quantity; offset \+= 500/);
});

test("GET은 read-only이고 오래된 모호 구매는 fail closed하며 조회 인덱스를 선언한다", async () => {
  const [paybackDb, indexes] = await Promise.all([
    readWeb("lib/db/mrbeast-soda-payback.ts"),
    readFile(new URL("packages/shared-db/src/indexes.ts", REPO_ROOT), "utf8"),
  ]);
  const getSection = paybackDb.slice(
    paybackDb.indexOf("export async function getMrBeastSodaPaybackState"),
    paybackDb.indexOf("export async function claimMrBeastSodaPayback"),
  );
  assert.doesNotMatch(getSection, /prepareMrBeastSodaPaybackAnchor|updateOne|insertOne/);
  assert.match(getSection, /assertNoAmbiguousPreCounterPurchases/);
  assert.match(paybackDb, /2026-07-31T07:15:36\.663Z/);
  assert.match(paybackDb, /Vercel production deployment/);
  assert.match(paybackDb, /15분 drain/);
  assert.match(
    paybackDb,
    /kstDate: \{[\s\S]*\$gte: MRBEAST_SODA_APOLOGY_PAYBACK_START_KST_DATE[\s\S]*\$lte: MRBEAST_SODA_APOLOGY_PAYBACK_END_KST_DATE/,
  );
  assert.match(
    indexes,
    /shop_daily_purchase_counters_userId_slug_kstDate/,
  );
});
