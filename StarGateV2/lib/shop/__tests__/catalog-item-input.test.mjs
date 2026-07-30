import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCatalogItemCreateBody } from "../catalog-item-input.ts";

function base(overrides = {}) {
  return {
    target: "shop",
    slug: "dynamic-ration",
    name: "동적 전투식량",
    category: "CONSUMABLE",
    description: "운영 품목",
    price: 25,
    isAvailable: true,
    isPublic: true,
    shopMeta: {
      stockMin: 1,
      stockMax: 5,
      appearRate: 0.8,
      pageGroup: "RECOVERY",
      icon: "🥫",
      color: "#445566",
    },
    ...overrides,
  };
}

test("shop target normalizes only DB master item fields", () => {
  const result = normalizeCatalogItemCreateBody(base());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.target, "shop");
  assert.equal("target" in result.value.input, false);
  assert.equal("armoryZone" in result.value.input, false);
  assert.deepEqual(result.value.input.shopMeta, {
    stockMin: 1,
    stockMax: 5,
    appearRate: 0.8,
    pageGroup: "RECOVERY",
    icon: "🥫",
    color: "#445566",
  });
});

test("armory target emits exact zone tags and rejects invalid category combinations", () => {
  const valid = normalizeCatalogItemCreateBody(
    base({
      target: "armory",
      armoryZone: "acheron",
      category: "WEAPON",
      shopMeta: undefined,
      tags: ["근접 무기"],
    }),
  );
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.deepEqual(valid.value.input.tags, [
      "근접 무기",
      "병기부",
      "아케론",
    ]);
    assert.equal(valid.value.input.shopMeta, undefined);
  }

  const invalid = normalizeCatalogItemCreateBody(
    base({
      target: "armory",
      armoryZone: "strategic",
      category: "ARMOR",
      shopMeta: undefined,
    }),
  );
  assert.deepEqual(invalid, {
    ok: false,
    error: "strategic 존에서 지원하지 않는 category 조합입니다.",
  });

  const tooManyTags = normalizeCatalogItemCreateBody(
    base({
      target: "armory",
      armoryZone: "towaski",
      category: "WEAPON",
      shopMeta: undefined,
      tags: Array.from({ length: 29 }, (_, index) => `태그-${index}`),
    }),
  );
  assert.equal(tooManyTags.ok, false);
});

test("operational targets reject unsafe slug, price, range, category, and image", () => {
  const cases = [
    base({ slug: "INVALID SLUG" }),
    base({ price: 0 }),
    base({ price: 1e308 }),
    base({ category: "WEAPON" }),
    base({
      shopMeta: { stockMin: 6, stockMax: 5, appearRate: 1 },
    }),
    base({
      shopMeta: { stockMin: 1, stockMax: 5, appearRate: -0.1 },
    }),
    base({ previewImage: "https://example.com/item.png" }),
    base({ previewImage: "/assets/../api/erp/users" }),
  ];
  for (const input of cases) {
    assert.equal(normalizeCatalogItemCreateBody(input).ok, false);
  }
});

test("legacy target-less request remains compatible but cannot smuggle shop metadata", () => {
  const legacy = normalizeCatalogItemCreateBody({
    name: "기록용 품목",
    category: "SPECIAL",
    description: "",
    price: "별도 협의",
    isAvailable: true,
    isPublic: true,
  });
  assert.equal(legacy.ok, true);
  if (legacy.ok) {
    assert.equal(legacy.value.target, undefined);
    assert.equal(legacy.value.input.price, "별도 협의");
  }

  const smuggled = normalizeCatalogItemCreateBody({
    name: "권한 우회",
    category: "CONSUMABLE",
    price: 1,
    shopMeta: { stockMin: 1, stockMax: 1, appearRate: 1 },
  });
  assert.equal(smuggled.ok, false);
});
