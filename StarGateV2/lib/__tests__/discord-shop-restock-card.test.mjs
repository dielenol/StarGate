import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShopRestockDiscordPayloads,
} from "../discord.ts";

test("large restock catalogs preserve every item across bounded fields", () => {
  const items = Array.from({ length: 120 }, (_, index) => ({
    name: `긴 이름의 신규 운영 품목 ${index.toString().padStart(3, "0")} ${"가".repeat(80)}`,
    icon: "◈",
    stock: 3,
    price: 100,
    pageGroup: "BASIC",
  }));
  const payloads = buildShopRestockDiscordPayloads({
    today: "2026-07-21",
    isOpen: true,
    items,
  });

  assert.ok(payloads.length > 1);
  const itemFieldValues = payloads.flatMap((discordPayload) =>
    discordPayload.embeds.flatMap((embed) =>
      embed.fields
        .filter((field) => field.name !== "편의점으로 가기")
        .map((field) => {
          assert.ok(field.value.length <= 1000);
          return field.value;
        }),
    ),
  );
  const combined = itemFieldValues.join("\n");
  for (const item of items) assert.ok(combined.includes(item.name));
});
