import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ELIGIBILITY = new URL("../purchase-eligibility.ts", import.meta.url);
const CATALOG = new URL("../catalog.ts", import.meta.url);
const QUOTE_ROUTE = new URL(
  "../../../app/api/erp/equipment-shop/quote/route.ts",
  import.meta.url,
);
const CHECKOUT_ROUTE = new URL(
  "../../../app/api/erp/equipment-shop/checkout/route.ts",
  import.meta.url,
);

test("purchase eligibility keeps ordered blocking reasons", async () => {
  const source = await readFile(ELIGIBILITY, "utf8");
  const basic = source.indexOf('code: "BASIC_LICENSE_REQUIRED"');
  const specific = source.indexOf('code: "LICENSE_REQUIRED"');
  const owned = source.indexOf('code: "LICENSE_ALREADY_OWNED"');
  const balance = source.indexOf('code: "INSUFFICIENT_BALANCE"');
  assert.ok(basic > 0 && basic < specific);
  assert.ok(specific < owned && owned < balance);
});

test("Towaski catalog requires explicit tags or canonical slug allowlist", async () => {
  const source = await readFile(CATALOG, "utf8");
  assert.match(source, /explicitlyTagged \|\| isTowaskiCatalogAllowlistedSlug/);
  assert.doesNotMatch(source, /if \(acheron\) return "acheron";\s*return "towaski"/);
  assert.match(
    source,
    /item\.zone === "towaski" && item\.category === "ARMOR"/,
  );
  assert.match(source, /zone: "acheron" as const/);
});

test("catalog availability no longer invents one unit of stock", async () => {
  const source = await readFile(CATALOG, "utf8");
  assert.match(source, /stock: null/);
  assert.doesNotMatch(source, /stock: available \? 1 : 0/);
});

test("GM quote reuses checkout eligibility without mutation primitives", async () => {
  const [quoteRoute, checkoutRoute] = await Promise.all([
    readFile(QUOTE_ROUTE, "utf8"),
    readFile(CHECKOUT_ROUTE, "utf8"),
  ]);
  assert.match(quoteRoute, /evaluateEquipmentPurchaseEligibility/);
  assert.match(checkoutRoute, /evaluateEquipmentPurchaseEligibility/);
  assert.match(quoteRoute, /candidate\.slug === key/);
  assert.doesNotMatch(quoteRoute, /addCredit|addToInventory|executeEconomicOperation/);
});

test("Acheron armor discount is recalculated by checkout instead of trusting client price", async () => {
  const checkoutRoute = await readFile(CHECKOUT_ROUTE, "utf8");

  assert.match(checkoutRoute, /quoteAcheronArmorReferral/);
  assert.match(checkoutRoute, /purchaseZone === "acheron"/);
  assert.match(checkoutRoute, /line\.sourceZone === "towaski"/);
  assert.match(checkoutRoute, /line\.category === "ARMOR"/);
  assert.match(checkoutRoute, /unitPrice > item\.expectedUnitPrice/);
  assert.match(checkoutRoute, /code: "PRICE_CHANGED"/);
  assert.doesNotMatch(checkoutRoute, /body\?\.price|rawItem\.price/);
});
