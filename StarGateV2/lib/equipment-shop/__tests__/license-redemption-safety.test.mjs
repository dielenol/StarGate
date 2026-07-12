import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { containsDuplicateEquipmentItemIds } from "../checkout-lines.ts";

const LICENSE_ROUTE = new URL(
  "../../../app/api/erp/equipment-shop/license-test/route.ts",
  import.meta.url,
);
const CHALLENGE_DB = new URL(
  "../../db/equipment-license-tests.ts",
  import.meta.url,
);
const CHECKOUT_ROUTE = new URL(
  "../../../app/api/erp/equipment-shop/checkout/route.ts",
  import.meta.url,
);
const CATALOG_QUERY = new URL(
  "../../../hooks/queries/useEquipmentShopQuery.ts",
  import.meta.url,
);
const CATALOG_ROUTE = new URL(
  "../../../app/api/erp/equipment-shop/catalog/route.ts",
  import.meta.url,
);
const EQUIPMENT_MUTATIONS = new URL(
  "../../../hooks/mutations/useEquipmentShopMutation.ts",
  import.meta.url,
);
const EQUIPMENT_SHOP_CLIENT = new URL(
  "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
  import.meta.url,
);
const SHARED_INVENTORY = new URL(
  "../../../../packages/shared-db/src/crud/inventory.ts",
  import.meta.url,
);

test("license redemption recovers an interrupted passed challenge", async () => {
  const route = await readFile(LICENSE_ROUTE, "utf8");
  const challengeDb = await readFile(CHALLENGE_DB, "utf8");

  assert.match(route, /startOrResumeTowaskiLicenseChallenge/);
  assert.match(challengeDb, /status: \{ \$in: \["passed", "redeeming"\] \}/);
  assert.match(challengeDb, /redemptionLeaseExpiresAt: \{ \$lte: now \}/);
  assert.match(challengeDb, /redemptionToken/);
});

test("license inventory grant and redeemed transition share one transaction", async () => {
  const route = await readFile(LICENSE_ROUTE, "utf8");

  assert.match(route, /mongoSession\.withTransaction/);
  assert.match(
    route,
    /grantTowaskiLicenseOnce\([\s\S]*session: mongoSession[\s\S]*markTowaskiLicenseChallengeRedeemed\([\s\S]*session: mongoSession/,
  );
  assert.match(route, /if \(!redeemed\)[\s\S]*LICENSE_TEST_CONFLICT/);
  assert.match(route, /waitForOwnedTowaskiLicense/);
  assert.match(route, /status: "already_owned"/);
});

test("license difficulty is fixed on the server challenge", async () => {
  const [route, challengeDb] = await Promise.all([
    readFile(LICENSE_ROUTE, "utf8"),
    readFile(CHALLENGE_DB, "utf8"),
  ]);

  assert.match(challengeDb, /difficulty: args\.difficulty/);
  assert.match(
    challengeDb,
    /getTowaskiLicenseTestRules\([\s\S]*challenge\.difficulty \?\? "standard"/,
  );
  assert.match(
    route,
    /evaluateTowaskiBasicLicenseTest\([\s\S]*challenge\.difficulty \?\? "standard"/,
  );
});

test("license challenge retries are idempotent per start and resolve request", async () => {
  const [route, challengeDb] = await Promise.all([
    readFile(LICENSE_ROUTE, "utf8"),
    readFile(CHALLENGE_DB, "utf8"),
  ]);

  assert.match(route, /readIdempotencyKey\(request\)/);
  assert.match(route, /export async function GET/);
  assert.match(route, /findTowaskiLicenseTestRequestChallenge/);
  assert.match(route, /startOrResumeTowaskiLicenseChallenge/);
  assert.match(route, /requestId/);
  assert.match(challengeDb, /startRequestId: args\.requestId/);
  assert.match(challengeDb, /equipment_license_test_requests/);
  assert.match(challengeDb, /equipment_license_test_requests_unique/);
  assert.match(challengeDb, /request\.action !== "start"/);
  assert.match(challengeDb, /request\.action !== "resolve"/);
  assert.match(challengeDb, /outcome: challengeOutcome\(next\)/);
  assert.match(
    challengeDb,
    /status: finalEvaluation\.passed \? "passed" : "failed"[\s\S]*completedAt: now/,
  );
  assert.match(challengeDb, /applyChallengeOutcome\(replay, request\.outcome\)/);
  assert.match(challengeDb, /session\.withTransaction/);
  assert.doesNotMatch(challengeDb, /lastResolution/);
  assert.match(challengeDb, /expiresAt: \{ \$lte: now \}/);
  assert.match(challengeDb, /\(args\.hit && elapsedMs > rules\.maxRoundDurationMs\)/);
  const mutations = await readFile(EQUIPMENT_MUTATIONS, "utf8");
  assert.match(mutations, /license-test\?requestId=/);
  assert.match(mutations, /status\.status !== "processing"/);
  assert.match(mutations, /TOWASKI_LICENSE_REDEMPTION_LEASE_MS \+ 5_000/);
});

test("equipment checkout serializes inventory and rejects owned licenses", async () => {
  const [checkout, inventory] = await Promise.all([
    readFile(CHECKOUT_ROUTE, "utf8"),
    readFile(SHARED_INVENTORY, "utf8"),
  ]);

  assert.match(checkout, /lockCharacterInventoryItems\([\s\S]*mongoSession/);
  assert.match(checkout, /prepareCharacterInventoryItemLocks/);
  assert.match(checkout, /LICENSE_ALREADY_OWNED/);
  assert.match(checkout, /listCharacterInventory\(characterId, \{[\s\S]*session: mongoSession/);
  assert.match(checkout, /mainChar\.type !== "AGENT"/);
  assert.match(
    checkout,
    /charactersCol\(\)[\s\S]*type: "AGENT"[\s\S]*session: mongoSession/,
  );
  assert.match(checkout, /inventoryLockItemIds[\s\S]*licenseSlugByItemId\.keys/);
  assert.match(
    checkout,
    /resolveEquipmentLicenseStatus\(\{[\s\S]*character: transactionCharacter[\s\S]*ownedLicenseSlugs/,
  );
  assert.match(checkout, /evaluateEquipmentPurchaseEligibility/);
  assert.doesNotMatch(checkout, /cartLicenseSlugs/);
  assert.match(inventory, /character_inventory_locks/);
  assert.match(inventory, /prepareCharacterInventoryItemLocks/);
  assert.doesNotMatch(inventory, /\{ upsert: true, session \}/);
});

test("equipment shop purchases one item at a time without cart controls", async () => {
  const [mutations, client] = await Promise.all([
    readFile(EQUIPMENT_MUTATIONS, "utf8"),
    readFile(EQUIPMENT_SHOP_CLIENT, "utf8"),
  ]);

  assert.match(mutations, /usePurchaseEquipmentShopItem/);
  assert.match(
    mutations,
    /body: JSON\.stringify\(\{[\s\S]*key: input\.key,[\s\S]*quantity: 1,[\s\S]*expectedUnitPrice: input\.expectedUnitPrice,[\s\S]*purchaseZone: input\.zone/,
  );
  assert.match(mutations, /setQueryData<CreditsResponse>[\s\S]*data\.balance/);
  assert.match(client, /purchaseLockRef\.current/);
  assert.match(client, /purchaseMutation\.isPending \|\| towaskiLicenseTestBusy/);
  assert.doesNotMatch(client, /type CartState/);
  assert.doesNotMatch(client, /반출 장바구니|한번에 결제|장바구니 담기/);
});

test("slug와 ObjectId가 같은 장비를 가리키면 canonical 중복으로 거부한다", () => {
  assert.equal(
    containsDuplicateEquipmentItemIds(["same-master-id", "same-master-id"]),
    true,
  );
  assert.equal(
    containsDuplicateEquipmentItemIds(["master-a", "master-b"]),
    false,
  );
});

test("catalog query cache is isolated by scope and character", async () => {
  const query = await readFile(CATALOG_QUERY, "utf8");

  assert.match(
    query,
    /EquipmentShopCatalogScope =[\s\S]*"all"[\s\S]*"towaski"[\s\S]*"acheron"[\s\S]*"strategic"/,
  );
  assert.match(query, /catalogScope:[\s\S]*characterId: string \| null/);
  assert.match(
    query,
    /queryKey: equipmentShopKeys\.catalogScope\(scope, characterId\)/,
  );
  assert.match(
    query,
    /const query = scope === "all" \? "" : `\?scope=\$\{scope\}`/,
  );
});

test("catalog license access is resolved from the authenticated main character", async () => {
  const route = await readFile(CATALOG_ROUTE, "utf8");

  assert.match(route, /findMainCharacterByOwner\(session\.user\.id\)/);
  assert.match(route, /listOwnedTowaskiLicenseSlugs/);
  assert.match(route, /applyEquipmentShopLicenseContext/);
});
