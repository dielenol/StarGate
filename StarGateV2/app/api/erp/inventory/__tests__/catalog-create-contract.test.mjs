import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE = new URL("../items/route.ts", import.meta.url);
const MUTATION = new URL(
  "../../../../../hooks/mutations/useInventoryMutation.ts",
  import.meta.url,
);

test("catalog creation keeps legacy V auth and adds GM defense for operational target", async () => {
  const source = await readFile(ROUTE, "utf8");
  assert.match(source, /requireRole\(session\.user\.role, "V"\)/);
  assert.match(
    source,
    /equipmentShopItemZone\([\s\S]*const requiresGm = Boolean\(normalized\.value\.target \|\| armoryZone\)[\s\S]*if \(requiresGm\)[\s\S]*requireRole\(session\.user\.role, "GM"\)/,
  );
  assert.match(source, /createMasterItem\(normalized\.value\.input\)/);
  assert.doesNotMatch(source, /createMasterItem\(\{[\s\S]*target:/);
});

test("operational item creation commits the master item and GM audit together", async () => {
  const source = await readFile(ROUTE, "utf8");
  assert.match(source, /if \(session\.user\.role === "GM"\)/);
  assert.match(source, /mongoSession\.withTransaction/);
  assert.match(
    source,
    /createMasterItem\(normalized\.value\.input,\s*\{[\s\S]*session: mongoSession/,
  );
  assert.match(
    source,
    /scheduleGmAdminAudit\(auditPayload,\s*\{[\s\S]*session: mongoSession/,
  );
  assert.doesNotMatch(source, /GM audit scheduling failed/);
});

test("public shop item creation commits one product launch webhook with the item", async () => {
  const source = await readFile(ROUTE, "utf8");
  assert.match(
    source,
    /shouldAnnounceShopProductLaunch\(normalized\.value\)/,
  );
  assert.match(
    source,
    /if \(!createdItem\._id\)[\s\S]*enqueueShopProductLaunchWebhook\([\s\S]*`shop-product-launch:\$\{createdItem\._id\.toHexString\(\)\}`[\s\S]*session: mongoSession/,
  );
  assert.match(
    source,
    /mongoSession\.withTransaction\([\s\S]*createMasterItem\([\s\S]*scheduleGmAdminAudit\([\s\S]*enqueueShopProductLaunchWebhook\(/,
  );
});

test("an inferred armory item cannot bypass operational validation by omitting target", async () => {
  const source = await readFile(ROUTE, "utf8");
  assert.match(
    source,
    /if \(armoryZone && normalized\.value\.target !== "armory"\)/,
  );
  assert.match(source, /ARMORY_TARGET_REQUIRED/);
  assert.match(source, /status: 400/);
});

test("reserved static shop slugs cannot be recreated through the legacy endpoint", async () => {
  const source = await readFile(ROUTE, "utf8");
  assert.match(source, /findShopItemBySlug\(normalized\.value\.input\.slug\)/);
  assert.match(source, /STATIC_SHOP_SLUG_RESERVED/);
  assert.doesNotMatch(
    source,
    /normalized\.value\.target === "shop"[\s\S]*findShopItemBySlug/,
  );
});

test("duplicate slug is mapped to an understandable 409 response", async () => {
  const source = await readFile(ROUTE, "utf8");
  assert.match(source, /isDuplicateKeyError\(err\)/);
  assert.match(source, /ITEM_SLUG_EXISTS/);
  assert.match(source, /status: 409/);
});

test("item creation invalidates inventory, equipment, shop, and admin notice caches", async () => {
  const source = await readFile(MUTATION, "utf8");
  const createHook = source.slice(
    source.indexOf("export function useCreateItem"),
    source.indexOf("export function useGrantInventory"),
  );
  assert.match(createHook, /inventoryKeys\.all/);
  assert.match(createHook, /equipmentShopKeys\.all/);
  assert.match(createHook, /shopKeys\.all/);
  assert.match(createHook, /notificationKeys\.all/);
});
