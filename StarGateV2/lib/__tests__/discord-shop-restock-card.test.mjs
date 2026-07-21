import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShopRestockDiscordPayload,
  createDailyShopRestockDiscordMessage,
  deleteDailyShopRestockDiscordMessage,
} from "../discord.ts";

const ENV_KEY = "DISCORD_WEBHOOK_SHOP_URL";

function payload() {
  return buildShopRestockDiscordPayload({
    today: "2026-07-21",
    isOpen: true,
    items: [
      {
        name: "응급 키트",
        icon: "🩹",
        stock: 3,
        price: 100,
        pageGroup: "RECOVERY",
      },
    ],
  });
}

test("daily shop restock uses wait=true and returns its message id", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  const calls = [];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/shop/token";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ id: "shop-restock-123" });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  const messageId = await createDailyShopRestockDiscordMessage(payload());

  assert.equal(messageId, "shop-restock-123");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(new URL(calls[0].url).searchParams.get("wait"), "true");
  assert.deepEqual(JSON.parse(calls[0].init.body).allowed_mentions, {
    parse: [],
  });
});

test("daily shop restock deletes the stored webhook message", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  const calls = [];
  process.env[ENV_KEY] =
    "https://discord.test/api/webhooks/shop/token?wait=true";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: 204 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  await deleteDailyShopRestockDiscordMessage("shop restock 123");

  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(
    calls[0].url,
    "https://discord.test/api/webhooks/shop/token/messages/shop%20restock%20123",
  );
});

test("a missing previous shop restock message is already deleted", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/shop/token";
  globalThis.fetch = async () => new Response(null, { status: 404 });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  await assert.doesNotReject(
    deleteDailyShopRestockDiscordMessage("missing-restock"),
  );
});

test("a non-404 shop restock delete error blocks replacement", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/shop/token";
  globalThis.fetch = async () =>
    new Response("Missing Access", { status: 403 });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  await assert.rejects(
    deleteDailyShopRestockDiscordMessage("forbidden-restock"),
    /편의점 입고 공지 삭제 실패 \(403\)/,
  );
});
