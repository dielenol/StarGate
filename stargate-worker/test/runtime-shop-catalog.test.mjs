import assert from "node:assert/strict";
import test from "node:test";

import {
  loadRuntimeShopCatalog,
} from "../dist/jobs/runtime-shop-catalog.js";

function master(overrides = {}) {
  return {
    slug: "worker-dynamic-ration",
    name: "워커 동적 전투식량",
    category: "CONSUMABLE",
    description: "예약 작업 포함 품목",
    price: 25,
    effect: "HP 3 회복",
    shopMeta: {
      stockMin: 2,
      stockMax: 6,
      appearRate: 0.75,
      pageGroup: "RECOVERY",
    },
    isAvailable: true,
    isPublic: true,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
    ...overrides,
  };
}

test("worker runtime catalog appends a valid master item", async () => {
  const catalog = await loadRuntimeShopCatalog({
    listItems: async () => [
      master({ slug: "cup_ramen" }),
      master(),
    ],
  });

  assert.ok(catalog.some((item) => item.slug === "cup_ramen"));
  assert.ok(
    catalog.some((item) => item.slug === "worker-dynamic-ration"),
  );
});
