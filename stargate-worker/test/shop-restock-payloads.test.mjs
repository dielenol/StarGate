import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShopRestockDesiredPayloads,
} from "../dist/jobs/desired-state.js";

test("large runtime catalogs preserve every item across bounded Discord fields", () => {
  const catalog = Array.from({ length: 120 }, (_, index) => ({
    slug: `runtime-item-${index.toString().padStart(3, "0")}`,
    name: `신규 운영 품목 ${index.toString().padStart(3, "0")} ${"가".repeat(80)}`,
    icon: "◈",
    price: 100,
    effect: "효과",
    description: "설명",
    stockMin: 1,
    stockMax: 3,
    appearRate: 1,
    color: "#d1b25c",
    pageGroup: "BASIC",
  }));
  const stockBySlug = new Map(catalog.map((item) => [item.slug, 3]));

  const payloads = buildShopRestockDesiredPayloads({
    date: "2026-07-30",
    now: new Date("2026-07-30T03:00:00.000Z"),
    catalog,
    stockBySlug,
    runtimeState: null,
  });

  assert.ok(payloads.length > 1);
  const values = payloads.flatMap((payload) =>
    payload.embeds.flatMap((embed) =>
      embed.fields
        .filter((field) => field.name !== "편의점으로 가기")
        .map((field) => {
          assert.ok(field.value.length <= 1_000);
          return field.value;
        }),
    ),
  );
  const combined = values.join("\n");
  for (const item of catalog) assert.ok(combined.includes(item.name));
});

test("expired GM force-close uses the automatic opening line", () => {
  const catalog = [
    {
      slug: "test-item",
      name: "테스트 상품",
      icon: "◈",
      price: 100,
      effect: "효과",
      description: "설명",
      stockMin: 1,
      stockMax: 3,
      appearRate: 1,
      color: "#d1b25c",
      pageGroup: "BASIC",
    },
  ];

  const [payload] = buildShopRestockDesiredPayloads({
    date: "2024-01-03",
    now: new Date("2024-01-02T21:00:00.000Z"),
    catalog,
    stockBySlug: new Map([["test-item", 3]]),
    runtimeState: {
      forceClosed: true,
      updatedAt: new Date("2024-01-01T22:00:00.000Z"),
    },
  });

  assert.match(
    payload.embeds[0].description,
    /지금은 문 열려 있어요/,
  );
  assert.doesNotMatch(
    payload.embeds[0].description,
    /GM이 잠깐 셔터/,
  );
});
