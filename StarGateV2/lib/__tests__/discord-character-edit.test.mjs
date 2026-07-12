import { test } from "node:test";
import { strict as assert } from "node:assert";

import { notifyCharacterEdit, notifyGmAdminAudit } from "../discord.ts";

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

test("GM admin audit uses the character audit webhook and sanitizes mentions", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  resetWebhookEnv();
  process.env.DISCORD_WEBHOOK_CHAR_EDIT_URL = "https://discord.test/admin";

  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetWebhookEnv();
  });

  const result = await notifyGmAdminAudit({
    action: "크레딧 지급",
    actor: { id: "gm-1", displayName: "@everyone GM", role: "GM" },
    summary: "100 CR 지급",
    target: "TEST-01",
    timestamp: new Date("2026-07-11T00:00:00.000Z"),
  });

  assert.equal(result, "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.test/admin");
  assert.equal(calls[0].body.username, "StarGate Admin Watch");
  assert.equal(calls[0].body.embeds[0].title, "GM 관리 작업: 크레딧 지급");
  assert.doesNotMatch(JSON.stringify(calls[0].body), /@everyone/);
});

test("non-GM admin audit is skipped", async (t) => {
  const originalFetch = globalThis.fetch;
  let called = false;

  resetWebhookEnv();
  process.env.DISCORD_WEBHOOK_CHAR_EDIT_URL = "https://discord.test/admin";
  globalThis.fetch = async () => {
    called = true;
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetWebhookEnv();
  });

  const result = await notifyGmAdminAudit({
    action: "관리 작업",
    actor: { id: "v-1", displayName: "V User", role: "V" },
    summary: "skip",
    timestamp: new Date("2026-07-11T00:00:00.000Z"),
  });

  assert.equal(result, "skipped");
  assert.equal(called, false);
});

test("GM admin audit uses the same fallback as GM character edits", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  resetWebhookEnv();
  process.env.DISCORD_WEBHOOK_URL = "https://discord.test/intake";
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetWebhookEnv();
  });

  const result = await notifyGmAdminAudit({
    action: "비공개 관리 작업",
    actor: { id: "gm-1", displayName: "GM", role: "GM" },
    summary: "private",
    timestamp: new Date("2026-07-11T00:00:00.000Z"),
  });

  assert.equal(result, "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.test/intake");
  assert.equal(calls[0].body.username, "StarGate Admin Watch");
});
