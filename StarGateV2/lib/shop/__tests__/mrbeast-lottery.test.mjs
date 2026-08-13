import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getMrBeastLotteryPrize,
  isMrBeastLotteryAnnouncementCandidate,
  isMrBeastLotteryActive,
  MRBEAST_LOTTERY_PRIZES,
  MRBEAST_LOTTERY_TOTAL_BUCKETS,
  parseMrBeastLotteryConfigUpdate,
  resolveMrBeastLotteryPrizeTable,
} from "../mrbeast-lottery.ts";

const WEB_ROOT = new URL("../../../", import.meta.url);
const REPO_ROOT = new URL("../../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("1,000,000 버킷 확률표의 수량과 경계가 정확하다", () => {
  assert.deepEqual(
    MRBEAST_LOTTERY_PRIZES.map(({ tier, bucketCount, reward }) => ({
      tier,
      bucketCount,
      reward,
    })),
    [
      { tier: "blank", bucketCount: 99_999, reward: 0 },
      { tier: "fifth", bucketCount: 450_000, reward: 40 },
      { tier: "fourth", bucketCount: 350_000, reward: 60 },
      { tier: "third", bucketCount: 90_000, reward: 80 },
      { tier: "second", bucketCount: 9_900, reward: 800 },
      { tier: "first", bucketCount: 100, reward: 10_000 },
      { tier: "zeroth", bucketCount: 1, reward: 100_000 },
    ],
  );
  assert.equal(
    MRBEAST_LOTTERY_PRIZES.reduce(
      (sum, prize) => sum + prize.bucketCount,
      0,
    ),
    MRBEAST_LOTTERY_TOTAL_BUCKETS,
  );
  assert.equal(getMrBeastLotteryPrize(0).tier, "blank");
  assert.equal(getMrBeastLotteryPrize(99_998).tier, "blank");
  assert.equal(getMrBeastLotteryPrize(99_999).tier, "fifth");
  assert.equal(getMrBeastLotteryPrize(549_998).tier, "fifth");
  assert.equal(getMrBeastLotteryPrize(549_999).tier, "fourth");
  assert.equal(getMrBeastLotteryPrize(899_998).tier, "fourth");
  assert.equal(getMrBeastLotteryPrize(899_999).tier, "third");
  assert.equal(getMrBeastLotteryPrize(989_998).tier, "third");
  assert.equal(getMrBeastLotteryPrize(989_999).tier, "second");
  assert.equal(getMrBeastLotteryPrize(999_898).tier, "second");
  assert.equal(getMrBeastLotteryPrize(999_899).tier, "first");
  assert.equal(getMrBeastLotteryPrize(999_998).tier, "first");
  assert.equal(getMrBeastLotteryPrize(999_999).tier, "zeroth");
  assert.throws(() => getMrBeastLotteryPrize(-1), RangeError);
  assert.throws(
    () => getMrBeastLotteryPrize(MRBEAST_LOTTERY_TOTAL_BUCKETS),
    RangeError,
  );
  const expectedValue =
    MRBEAST_LOTTERY_PRIZES.reduce(
      (sum, prize) => sum + prize.bucketCount * prize.reward,
      0,
    ) / MRBEAST_LOTTERY_TOTAL_BUCKETS;
  assert.equal(expectedValue, 55.22);
  assert.equal(
    resolveMrBeastLotteryPrizeTable("mrbeast-lottery-v1"),
    MRBEAST_LOTTERY_PRIZES,
  );
  assert.throws(
    () => resolveMrBeastLotteryPrizeTable("unknown-version"),
    /Unknown MrBeast lottery prize table/,
  );
});

test("저장 토글과 유효한 UTC 기간이 모두 맞아야 현재 이벤트가 활성화된다", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");
  const activeConfig = {
    enabled: true,
    eventId: "mrbeast-test",
    startAt: new Date("2026-08-01T00:00:00.000Z"),
    endAt: new Date("2026-08-02T00:00:00.000Z"),
  };

  assert.equal(
    isMrBeastLotteryActive({ ...activeConfig, enabled: false }, now),
    false,
  );
  assert.equal(
    isMrBeastLotteryActive({ ...activeConfig, eventId: null }, now),
    false,
  );
  assert.equal(
    isMrBeastLotteryActive({ ...activeConfig, endAt: null }, now),
    false,
  );
  assert.equal(isMrBeastLotteryActive(activeConfig, now), true);
  assert.equal(
    isMrBeastLotteryActive(
      activeConfig,
      new Date("2026-08-02T00:00:00.000Z"),
    ),
    false,
  );
});

test("GM 설정 입력은 안전한 eventId, UTC ISO 기간, expectedVersion을 엄격 검증한다", () => {
  const valid = {
    enabled: true,
    eventId: "mrbeast-lottery-2026-01",
    startAt: "2026-08-01T00:00:00.000Z",
    endAt: "2026-08-02T00:00:00Z",
    expectedVersion: 0,
  };
  const parsed = parseMrBeastLotteryConfigUpdate(valid);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.input.startAt instanceof Date, true);
  assert.equal(
    parseMrBeastLotteryConfigUpdate({
      ...valid,
      eventId: "mrbeast_lottery-2026_01",
    }).ok,
    true,
  );

  for (const invalid of [
    { ...valid, eventId: "../unsafe" },
    { ...valid, eventId: "MrBeast-2026" },
    { ...valid, startAt: "2026-08-01T09:00:00+09:00" },
    { ...valid, endAt: valid.startAt },
    { ...valid, expectedVersion: -1 },
    { ...valid, unexpected: true },
  ]) {
    assert.equal(parseMrBeastLotteryConfigUpdate(invalid).ok, false);
  }
});

test("복권 운영 설정은 deterministic singleton과 GM version CAS로만 변경된다", async () => {
  const [database, adminRoute, publicRoute, checkout, environment] =
    await Promise.all([
      readWeb("lib/db/mrbeast-lottery.ts"),
      readWeb("app/api/erp/shop/admin/lottery/route.ts"),
      readWeb("app/api/erp/shop/lottery/route.ts"),
      readWeb("app/api/erp/shop/checkout/route.ts"),
      readWeb(".env.example"),
    ]);

  assert.match(database, /LOTTERY_CONFIG_ID = "mrbeast-lottery"/);
  assert.match(database, /LOTTERY_CONFIG_COLLECTION = "shop_runtime_state"/);
  assert.match(
    database,
    /_id: LOTTERY_CONFIG_ID,[\s\S]*version: input\.expectedVersion/,
  );
  assert.match(database, /\$inc: \{ version: 1 \}/);
  assert.match(database, /upsert: input\.expectedVersion === 0/);
  assert.match(
    database,
    /fenceActiveMrBeastLotteryConfigForGrant[\s\S]*version: input\.expectedVersion[\s\S]*startAt: \{ \$lte: input\.now \}[\s\S]*endAt: \{ \$gt: input\.now \}[\s\S]*\$inc: \{ grantFenceVersion: 1 \}[\s\S]*session: input\.session/,
  );
  assert.doesNotMatch(database, /\.createIndex(?:es)?\(/);

  assert.match(adminRoute, /requireRole\(role, "GM"\)/);
  assert.match(adminRoute, /parseMrBeastLotteryConfigUpdate/);
  assert.match(adminRoute, /freshIndexes: validation\.input\.enabled/);
  assert.match(
    adminRoute,
    /validation\.input\.enabled && !readiness\.ready/,
  );
  assert.match(adminRoute, /LOTTERY_CONFIG_CHANGED/);
  assert.match(
    adminRoute,
    /withTransaction[\s\S]*updateMrBeastLotteryConfig\([\s\S]*session: mongoSession[\s\S]*scheduleGmAdminAudit\([\s\S]*\{ session: mongoSession \}/,
  );
  assert.match(adminRoute, /private, no-store/);

  assert.match(
    publicRoute,
    /const config = await getMrBeastLotteryConfig\(\)/,
  );
  assert.match(
    checkout,
    /const lotteryConfig = await getMrBeastLotteryConfig\(\)/,
  );
  assert.match(
    checkout,
    /fenceActiveMrBeastLotteryConfigForGrant\([\s\S]*expectedVersion: lotteryConfig\.version[\s\S]*session: mongoSession/,
  );
  assert.match(
    checkout,
    /fenceLotteryCharacterOwner\([\s\S]*ownerId: session\.user\.id[\s\S]*session: mongoSession/,
  );
  assert.match(checkout, /lotteryConfig\.active/);
  assert.doesNotMatch(
    [database, adminRoute, publicRoute, checkout, environment].join("\n"),
    /MRBEAST_LOTTERY_(?:ENABLED|EVENT_ID|START_AT|END_AT)/,
  );
});

test("2등, 1등, 0등만 전역 공지 후보이다", () => {
  for (const tier of ["blank", "fifth", "fourth", "third"]) {
    assert.equal(isMrBeastLotteryAnnouncementCandidate(tier), false);
  }
  for (const tier of ["second", "first", "zeroth"]) {
    assert.equal(isMrBeastLotteryAnnouncementCandidate(tier), true);
  }
});

test("캐릭터 귀속 복권은 거래 생성과 정산 양쪽에서 거부된다", async () => {
  const trades = await readFile(
    new URL("packages/shared-db/src/crud/trades.ts", REPO_ROOT),
    "utf8",
  );
  assert.match(
    trades,
    /NON_TRANSFERABLE_ITEM_SLUGS = new Set\(\[[\s\S]*"mrbeast_lottery"[\s\S]*"mrbeast_apology_lottery"[\s\S]*\]\)/,
  );
  assert.match(
    trades,
    /master\.isPublic === false[\s\S]*!isPlayerTradeItemSlugTransferable\(master\.slug\)[\s\S]*"ITEM_NOT_TRANSFERABLE"/,
  );
  assert.match(trades, /createOpenPlayerTrade[\s\S]*validateOwnedOffer/);
  assert.match(trades, /settleTrade[\s\S]*validateOwnedOffer/);
});

test("checkout은 PURCHASE 수량만큼 entitlement와 표시 mirror를 같은 session에서 지급한다", async () => {
  const [checkout, database] = await Promise.all([
    readWeb("app/api/erp/shop/checkout/route.ts"),
    readWeb("lib/db/mrbeast-lottery.ts"),
  ]);

  assert.match(checkout, /MRBEAST_SODA_SLUG/);
  assert.match(checkout, /MRBEAST_LOTTERY_SLUG/);
  assert.match(checkout, /findMasterItemsBySlugs\(masterLookupSlugs\)/);
  assert.match(checkout, /findMasterItemBySlug\(MRBEAST_LOTTERY_SLUG\)/);
  assert.match(checkout, /isMrBeastLotteryTicketMasterReady/);
  assert.match(checkout, /LOTTERY_MISCONFIGURED/);
  assert.match(checkout, /assertMrBeastLotteryIndexesReady\(\)/);
  assert.match(
    checkout,
    /executeEconomicOperation\([\s\S]*type: "PURCHASE"[\s\S]*grantMrBeastLotteryTicketsForPurchase\([\s\S]*sourceRequestId: requestId[\s\S]*quantity: lotteryEventUnchanged \? lotteryTicketQuantity : 0[\s\S]*session: mongoSession/,
  );
  assert.match(database, /mrbeast_lottery_entitlements/);
  assert.match(database, /sourceRequestId: input\.sourceRequestId/);
  assert.match(database, /ordinal/);
  assert.match(database, /status: "AVAILABLE"/);
  assert.match(database, /prizeTableVersion: input\.config\.prizeTableVersion/);
  assert.match(database, /addToInventory\([\s\S]*session: input\.session/);
});

test("claim은 FIFO entitlement 하나를 원자 claim하고 callback retry에도 결과를 재추첨하지 않는다", async () => {
  const [route, database, indexes] = await Promise.all([
    readWeb("app/api/erp/shop/lottery/route.ts"),
    readWeb("lib/db/mrbeast-lottery.ts"),
    readFile(
      new URL("packages/shared-db/src/indexes.ts", REPO_ROOT),
      "utf8",
    ),
  ]);

  const drawIndex = route.indexOf("const fixedBucket =");
  const operationIndex = route.indexOf("executeEconomicOperation({");
  assert.ok(drawIndex >= 0 && drawIndex < operationIndex);
  assert.doesNotMatch(
    route.slice(operationIndex),
    /drawMrBeastLotteryPrize/,
  );
  assert.doesNotMatch(route, /payload: \{[^}]*bucket/);
  assert.match(
    database,
    /status: "AVAILABLE"[\s\S]*sort: \{ grantedAt: 1, _id: 1 \}/,
  );
  const resolveVersionIndex = database.indexOf(
    "getMrBeastLotteryPrize(",
    database.indexOf("const candidate ="),
  );
  const claimEntitlementIndex = database.indexOf(
    "const entitlement = await entitlements.findOneAndUpdate",
  );
  assert.ok(
    resolveVersionIndex >= 0 &&
      claimEntitlementIndex >= 0 &&
      resolveVersionIndex < claimEntitlementIndex,
  );
  assert.match(database, /status: "CLAIMED"/);
  assert.match(database, /claimId: input\.claimId/);
  assert.match(database, /eventId: entitlement\.eventId/);
  assert.match(database, /prizeTableVersion: entitlement\.prizeTableVersion/);
  assert.match(database, /bucket: input\.bucket/);
  assert.match(database, /countDocuments\([\s\S]*status: "AVAILABLE"/);
  const stateFunction = database.slice(
    database.indexOf("export async function getMrBeastLotteryState"),
    database.indexOf("export async function listRecentMrBeastLotteryWinners"),
  );
  assert.doesNotMatch(stateFunction, /characterInventoryCol/);
  assert.doesNotMatch(
    database,
    /if \(!consumed\.ok\)[\s\S]*NO_LOTTERY_TICKET/,
  );
  assert.match(database, /reconcileTicketInventoryMirror/);
  assert.match(
    indexes,
    /key: \{ characterId: 1 \}[\s\S]*mrbeast_lottery_claims_pending_character_global_unique[\s\S]*unique: true[\s\S]*status: "PENDING"/,
  );
  assert.match(
    indexes,
    /eventId: 1, sourceRequestId: 1, ordinal: 1[\s\S]*mrbeast_lottery_entitlements_source_ordinal_unique[\s\S]*unique: true/,
  );
  assert.match(
    indexes,
    /mrbeast_lottery_entitlements_claim_unique[\s\S]*unique: true[\s\S]*claimId: \{ \$type: "string" \}/,
  );
});

test("종료·EVENT_ID·소유자 변경 뒤에도 global pending을 현재 소유자에게 이관해 reveal한다", async () => {
  const [database, route, revealRoute] = await Promise.all([
    readWeb("lib/db/mrbeast-lottery.ts"),
    readWeb("app/api/erp/shop/lottery/route.ts"),
    readWeb("app/api/erp/shop/lottery/reveal/route.ts"),
  ]);

  assert.match(
    database,
    /findOne\(\s*\{ characterId, status: "PENDING" \}/,
  );
  assert.match(database, /eventId: claim\.eventId/);
  assert.match(
    database,
    /config\.active \|\| availableTickets > 0 \|\| pendingClaim !== null/,
  );

  const revealFunction = database.slice(
    database.indexOf("export async function revealMrBeastLotteryClaim"),
  );
  assert.match(
    revealFunction,
    /const filter = \{[\s\S]*characterId: input\.characterId/,
  );
  const revealFilter = revealFunction.match(
    /const filter = \{([\s\S]*?)\n  \};/,
  )?.[1] ?? "";
  assert.doesNotMatch(revealFilter, /ownerId/);
  assert.match(revealFunction, /ownerChanged = existing\.ownerId !== input\.ownerId/);
  assert.match(revealFunction, /\$push:[\s\S]*ownerHistory:/);
  assert.match(revealFunction, /ownerId: input\.ownerId/);
  assert.match(revealFunction, /ownerName: input\.ownerName/);
  assert.match(
    database,
    /fenceLotteryCharacterOwner[\s\S]*findOneAndUpdate\([\s\S]*ownerId: input\.ownerId[\s\S]*\$inc: \{ lotteryEconomyFenceVersion: 1 \}[\s\S]*returnDocument: "after"/,
  );
  assert.ok(
    database.match(/await fenceLotteryCharacterOwner\(/g)?.length === 2,
    "claim start와 reveal 모두 transaction 내부 owner fence를 사용해야 한다",
  );
  assert.doesNotMatch(
    revealFunction.slice(0, revealFunction.indexOf("const existing")),
    /eventId/,
  );
  assert.doesNotMatch(revealRoute, /resolveMrBeastLotteryConfig/);
  assert.match(revealRoute, /payload: \{ claimId \}/);
  assert.match(revealRoute, /ownerId: session\.user\.id/);
  assert.match(revealRoute, /ownerName: session\.user\.displayName/);

  const startPost = route.slice(route.indexOf("export async function POST"));
  assert.doesNotMatch(startPost, /config\.enabled/);
  assert.match(
    startPost,
    /payload: \{ action: "start-or-resume", expectedCharacterId, ticketSlug \}/,
  );
});

test("신규 grant/start readiness는 listIndexes와 hidden master shape로 fail closed한다", async () => {
  const [database, checkout, route, revealRoute] = await Promise.all([
    readWeb("lib/db/mrbeast-lottery.ts"),
    readWeb("app/api/erp/shop/checkout/route.ts"),
    readWeb("app/api/erp/shop/lottery/route.ts"),
    readWeb("app/api/erp/shop/lottery/reveal/route.ts"),
  ]);

  assert.match(database, /\.listIndexes\(\)\.toArray\(\)/);
  assert.doesNotMatch(database, /\.createIndex(?:es)?\(/);
  assert.match(database, /Boolean\(index\.unique\) === requirement\.unique/);
  assert.match(database, /partialFilterExpression/);
  assert.match(database, /LOTTERY_MISCONFIGURED/);
  assert.match(database, /master\.category === "CONSUMABLE"/);
  assert.match(database, /master\.isAvailable === false/);
  assert.match(database, /master\.isPublic === false/);
  assert.match(checkout, /assertMrBeastLotteryIndexesReady\(\)/);
  assert.match(route, /assertMrBeastLotteryIndexesReady\(\)/);
  assert.match(
    route,
    /if \(!state\.pendingClaim && \(state\.active \|\| state\.availableTickets > 0\)\)/,
  );
  assert.doesNotMatch(revealRoute, /assertMrBeastLotteryIndexesReady/);
});

test("reveal은 claim 상태 전환과 EVENT_REWARD를 exactly-once 결합한다", async () => {
  const database = await readWeb("lib/db/mrbeast-lottery.ts");

  assert.match(
    database,
    /findOneAndUpdate\([\s\S]*status: "PENDING"[\s\S]*status: "REVEALED"/,
  );
  assert.match(database, /type: "EVENT_REWARD"/);
  assert.match(
    database,
    /requestId: `mrbeast-lottery-reward:\$\{revealed\._id\.toHexString\(\)\}`/,
  );
  for (const field of ["eventId", "claimId", "tier", "prizeTableVersion"]) {
    assert.match(database, new RegExp(`${field}: revealed\\.`));
  }
  assert.match(database, /session: input\.session/);
});

test("2등 이상 당첨은 durable Discord 공지로 예약되고 공개 캐릭터만 ERP 최근 당첨에 표시된다", async () => {
  const [database, client, outbox] = await Promise.all([
    readWeb("lib/db/mrbeast-lottery.ts"),
    readWeb("app/(erp)/erp/shop/ShopClient.tsx"),
    readWeb("lib/outbox/integration.ts"),
  ]);

  assert.match(
    database,
    /characterFence\.isPublic[\s\S]*isMrBeastLotteryAnnouncementCandidate\(completed\.tier\)[\s\S]*enqueueMrBeastLotteryWinnerWebhook\([\s\S]*mrbeast-lottery-winner:[\s\S]*session: input\.session/,
  );
  assert.match(outbox, /kind: "MRBEAST_LOTTERY_WINNER_WEBHOOK"/);
  assert.match(outbox, /revealedAt: payload\.revealedAt\.toISOString\(\)/);
  assert.match(database, /tier: \{ \$in: \["second", "first", "zeroth"\] \}/);
  assert.match(database, /characterIsPublic: true/);
  assert.match(database, /characterIsPublic: input\.characterIsPublic/);
  const winnersFunction = database.slice(
    database.indexOf("export async function listRecentMrBeastLotteryWinners"),
    database.indexOf("export async function startOrResumeMrBeastLotteryClaim"),
  );
  assert.doesNotMatch(winnersFunction, /eventId:/);
  assert.match(winnersFunction, /\$lookup:[\s\S]*from: "characters"/);
  assert.match(winnersFunction, /\$match: \{ "_character\.isPublic": true \}/);
  assert.match(database, /claimId: claim\._id\.toHexString\(\)/);
  assert.match(client, /lotteryState\.recentWinners/);
  assert.match(client, /winner\.characterCodename/);
  assert.doesNotMatch(client, /winner\.owner/);
});

test("스크래치 UI는 pointer/touch, 65% threshold, reduced motion과 0등 최강 효과를 보장한다", async () => {
  const [component, css, mutations, queries, client] = await Promise.all([
    readWeb("app/(erp)/erp/shop/MrBeastLotteryModal.tsx"),
    readWeb("app/(erp)/erp/shop/MrBeastLotteryModal.module.css"),
    readWeb("hooks/mutations/useShopMutation.ts"),
    readWeb("hooks/queries/useShopQuery.ts"),
    readWeb("app/(erp)/erp/shop/ShopClient.tsx"),
  ]);

  assert.match(component, /SCRATCH_REVEAL_THRESHOLD = 0\.65/);
  assert.match(component, /onPointerDown=/);
  assert.match(component, /onPointerMove=/);
  assert.match(component, /onPointerCancel=/);
  assert.match(component, /스크래치 대신 결과 확인/);
  assert.match(component, /scratchMoveCountRef\.current % 5/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.result--first[\s\S]*0 0 54px/);
  assert.match(css, /\.result--zeroth[\s\S]*0 0 96px[\s\S]*0 0 160px/);
  assert.match(mutations, /shopKeys\.lottery/);
  assert.match(mutations, /shopKeys\.inventory/);
  assert.match(mutations, /creditKeys\.all/);
  assert.match(mutations, /notificationKeys\.all/);
  assert.doesNotMatch(mutations, /router\.refresh/);
  assert.match(queries, /refetchInterval:/);
  assert.doesNotMatch(client, /localStorage/);
  assert.match(client, /const pendingClaim = lotteryState\?\.pendingClaim/);
});
