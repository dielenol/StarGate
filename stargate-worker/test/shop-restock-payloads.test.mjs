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
