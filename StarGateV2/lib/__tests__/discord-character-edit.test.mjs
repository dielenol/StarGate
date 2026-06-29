import { test } from "node:test";
import { strict as assert } from "node:assert";

import { notifyCharacterEdit } from "../discord.ts";

const ENV_KEYS = [
  "DISCORD_WEBHOOK_URL",
  "DISCORD_WEBHOOK_CHAR_EDIT_URL",
  "DISCORD_WEBHOOK_CHAR_SELF_EDIT_URL",
  "DISCORD_WEBHOOK_CHARACTER_SELF_EDIT_URL",
];

function resetWebhookEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function makePayload(overrides = {}) {
  return {
    character: {
      id: "507f1f77bcf86cd799439011",
      codename: "TEST-01",
      name: "Test Agent",
    },
    actor: {
      id: "user-1",
      displayName: "Tester",
      role: "GM",
    },
    source: "admin",
    actorIsOwner: true,
    changes: [{ field: "lore.quote", before: "old", after: "new" }],
    timestamp: new Date("2026-06-01T03:00:00.000Z"),
    ...overrides,
  };
}

test("player self-edit uses the character audit webhook with player warning", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  resetWebhookEnv();
  process.env.DISCORD_WEBHOOK_URL = "https://discord.test/contact";
  process.env.DISCORD_WEBHOOK_CHAR_EDIT_URL = "https://discord.test/admin";

  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetWebhookEnv();
  });

  await notifyCharacterEdit(
    makePayload({
      source: "player",
      actorIsOwner: true,
      actor: { id: "user-1", displayName: "Tester", role: "J" },
    }),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.test/admin");
  assert.equal(calls[0].body.username, "StarGate Character Watch");
  assert.equal(calls[0].body.embeds[0].color, 0x5ea3c5);
  assert.equal(calls[0].body.embeds[0].fields[0].name, "경고");
  assert.match(calls[0].body.embeds[0].fields[0].value, /유저 자가편집/);
});

test("admin edit uses the character audit webhook with admin warning", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  resetWebhookEnv();
  process.env.DISCORD_WEBHOOK_URL = "https://discord.test/contact";
  process.env.DISCORD_WEBHOOK_CHAR_EDIT_URL = "https://discord.test/admin";

  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetWebhookEnv();
  });

  await notifyCharacterEdit(
    makePayload({
      source: "admin",
      actorIsOwner: false,
      actor: { id: "gm-1", displayName: "GM", role: "GM" },
    }),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.test/admin");
  assert.equal(calls[0].body.username, "StarGate Audit Bot");
  assert.equal(calls[0].body.embeds[0].color, 0xc5a059);
  assert.equal(calls[0].body.embeds[0].fields[0].name, "경고");
  assert.match(calls[0].body.embeds[0].fields[0].value, /GM\/운영진 직접 수정/);
});

test("admin edit by the owner is still classified as admin edit", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  resetWebhookEnv();
  process.env.DISCORD_WEBHOOK_URL = "https://discord.test/contact";
  process.env.DISCORD_WEBHOOK_CHAR_EDIT_URL = "https://discord.test/admin";

  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetWebhookEnv();
  });

  await notifyCharacterEdit(
    makePayload({
      source: "admin",
      actorIsOwner: true,
      actor: { id: "gm-owner", displayName: "GM Owner", role: "GM" },
    }),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.test/admin");
  assert.equal(calls[0].body.username, "StarGate Audit Bot");
  assert.equal(calls[0].body.embeds[0].color, 0xc5a059);
  assert.match(calls[0].body.embeds[0].fields[0].value, /GM\/운영진 직접 수정/);
});
