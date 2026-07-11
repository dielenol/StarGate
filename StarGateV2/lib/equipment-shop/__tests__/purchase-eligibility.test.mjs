import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateEquipmentPurchaseEligibility } from "../purchase-eligibility.ts";

const CATALOG = new URL("../catalog.ts", import.meta.url);
const QUOTE_ROUTE = new URL(
  "../../../app/api/erp/equipment-shop/quote/route.ts",
  import.meta.url,
);
const CHECKOUT_ROUTE = new URL(
  "../../../app/api/erp/equipment-shop/checkout/route.ts",
  import.meta.url,
);

test("purchase eligibility keeps ordered blocking reasons", () => {
  const base = {
    isGM: false,
    hasBasicLicense: false,
    available: false,
    price: 100,
    balance: 0,
    licenseOwned: true,
    licenseRequirement: {
      itemSlug: "basic-sniper-rifle",
      itemName: "보급형 저격소총",
      licenseSlug: "towaski-license-precision-firearm",
      licenseName: "토와스키 정밀 사격 라이센스",
      label: "정밀 사격",
      reason: "장거리 정밀 화기 반출",
      qualificationKeywords: [],
    },
    licenseStatus: { satisfied: false, source: null },
  };

  assert.equal(evaluateEquipmentPurchaseEligibility(base).code, "ITEM_NOT_AVAILABLE");
  assert.equal(
    evaluateEquipmentPurchaseEligibility({ ...base, available: true }).code,
    "BASIC_LICENSE_REQUIRED",
  );
  assert.equal(
    evaluateEquipmentPurchaseEligibility({
      ...base,
      available: true,
      hasBasicLicense: true,
    }).code,
    "LICENSE_REQUIRED",
  );
  assert.equal(
    evaluateEquipmentPurchaseEligibility({
      ...base,
      available: true,
      hasBasicLicense: true,
      licenseStatus: { satisfied: true, source: "owned_license" },
    }).code,
    "LICENSE_ALREADY_OWNED",
  );
  assert.equal(
    evaluateEquipmentPurchaseEligibility({
      ...base,
      available: true,
      hasBasicLicense: true,
      licenseOwned: false,
      licenseStatus: { satisfied: true, source: "owned_license" },
    }).code,
    "INSUFFICIENT_BALANCE",
  );
});

test("item-scoped character qualification grants access without a basic license", () => {
  const result = evaluateEquipmentPurchaseEligibility({
    isGM: false,
    hasBasicLicense: false,
    available: true,
    price: 100,
    balance: 100,
    licenseOwned: false,
    licenseRequirement: {
      itemSlug: "basic-sonic-emitter",
      itemName: "보급형 음파 방출기",
      licenseSlug: "towaski-license-sonic-equipment",
      licenseName: "토와스키 음파 장비 라이센스",
      label: "음파 장비",
      reason: "음파 장비 출력 봉인 반출",
      qualificationKeywords: [],
    },
    licenseStatus: {
      satisfied: true,
      source: "character_qualification",
      matchedKeyword: "스타크 일로니손 / 음파 방출기 특전",
    },
  });

  assert.equal(result.eligible, true);
  assert.equal(result.code, null);
});

test("Towaski catalog requires explicit tags or canonical slug allowlist", async () => {
  const source = await readFile(CATALOG, "utf8");
  assert.match(source, /explicitlyTagged \|\| isTowaskiCatalogAllowlistedSlug/);
  assert.doesNotMatch(source, /if \(acheron\) return "acheron";\s*return "towaski"/);
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
