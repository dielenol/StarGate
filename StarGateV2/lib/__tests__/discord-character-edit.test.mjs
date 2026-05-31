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

test("owner self-edit uses the public contact webhook even when source is admin", async (t) => {
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

  await notifyCharacterEdit(makePayload());

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.test/contact");
  assert.equal(calls[0].body.username, "StarGate Character Watch");
});

test("non-owner admin edit uses the character audit webhook", async (t) => {
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
      actorIsOwner: false,
      actor: { id: "gm-1", displayName: "GM", role: "GM" },
    }),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.test/admin");
  assert.equal(calls[0].body.username, "StarGate Audit Bot");
});
