import { test } from "node:test";
import { strict as assert } from "node:assert";

import { notifyShopReorderRequest } from "../discord.ts";

const ENV_KEYS = [
  "DISCORD_WEBHOOK_URL",
  "DISCORD_WEBHOOK_CHAR_EDIT_URL",
  "DISCORD_WEBHOOK_CHAR_SELF_EDIT_URL",
  "DISCORD_WEBHOOK_CHARACTER_SELF_EDIT_URL",
  "DISCORD_WEBHOOK_SHOP_URL",
  "DISCORD_WEBHOOK_SHOP_AVATAR_URL",
];

function resetWebhookEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function makePayload(overrides = {}) {
  return {
    today: "2026-07-09",
    item: {
      slug: "test-item",
      name: "Test Item",
      icon: "*",
      price: 1200,
      pageGroup: "BASIC",
    },
    requester: {
      id: "user-1",
      displayName: "Tester",
    },
    character: {
      id: "507f1f77bcf86cd799439011",
      codename: "TEST-01",
    },
    requestedAt: new Date("2026-07-09T03:00:00.000Z"),
    ...overrides,
  };
}

test("shop reorder request uses the character audit webhook, not the shop webhook", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  resetWebhookEnv();
  process.env.DISCORD_WEBHOOK_SHOP_URL = "https://discord.test/shop";
  process.env.DISCORD_WEBHOOK_CHAR_EDIT_URL = "https://discord.test/character-audit";

  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetWebhookEnv();
  });

  const result = await notifyShopReorderRequest(makePayload());

  assert.equal(result, "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.test/character-audit");
  assert.equal(calls[0].body.username, "띠아");
  assert.equal(calls[0].body.embeds[0].title, "편의점 발주 요청");
});

test("shop reorder request falls back to the self-edit webhook when the audit webhook is absent", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  resetWebhookEnv();
  process.env.DISCORD_WEBHOOK_SHOP_URL = "https://discord.test/shop";
  process.env.DISCORD_WEBHOOK_CHAR_SELF_EDIT_URL =
    "https://discord.test/character-self-edit";

  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetWebhookEnv();
  });

  const result = await notifyShopReorderRequest(makePayload());

  assert.equal(result, "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.test/character-self-edit");
});
