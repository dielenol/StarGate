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
const SHARED_INVENTORY = new URL(
  "../../../../packages/shared-db/src/crud/inventory.ts",
  import.meta.url,
);

test("license redemption recovers an interrupted passed challenge", async () => {
  const route = await readFile(LICENSE_ROUTE, "utf8");
  const challengeDb = await readFile(CHALLENGE_DB, "utf8");

  assert.match(route, /findRecoverableTowaskiLicenseChallenge/);
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
  assert.match(inventory, /character_inventory_locks/);
  assert.match(inventory, /prepareCharacterInventoryItemLocks/);
  assert.doesNotMatch(inventory, /\{ upsert: true, session \}/);
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

test("catalog query cache is isolated by all and towaski scope", async () => {
  const query = await readFile(CATALOG_QUERY, "utf8");

  assert.match(query, /EquipmentShopCatalogScope = "all" \| "towaski"/);
  assert.match(query, /catalogScope: \(scope: EquipmentShopCatalogScope\)/);
  assert.match(query, /queryKey: equipmentShopKeys\.catalogScope\(scope\)/);
  assert.match(query, /scope === "towaski" \? "\?scope=towaski" : ""/);
});
