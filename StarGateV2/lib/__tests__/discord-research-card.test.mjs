import assert from "node:assert/strict";
import test from "node:test";

import {
  createEquipmentResearchDiscordCard,
  deleteEquipmentResearchDiscordCard,
} from "../discord.ts";

const ENV_KEY = "DISCORD_WEBHOOK_RESEARCH_URL";

test("연구 카드는 wait=true로 생성하고 반환된 message id를 사용한다", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  const calls = [];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/hook/token";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ id: "message-123" });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  const id = await createEquipmentResearchDiscordCard({
    username: "Research",
    allowed_mentions: { parse: [] },
    embeds: [],
  });

  assert.equal(id, "message-123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(new URL(calls[0].url).searchParams.get("wait"), "true");
});

test("저장된 연구 카드 message id로 DELETE를 호출한다", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  const calls = [];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/hook/token?wait=true";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: 204 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  await deleteEquipmentResearchDiscordCard("message 123");

  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(
    calls[0].url,
    "https://discord.test/api/webhooks/hook/token/messages/message%20123",
  );
});

test("기존 카드가 이미 사라진 404는 성공으로 처리한다", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/hook/token";
  globalThis.fetch = async () => new Response(null, { status: 404 });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  await assert.doesNotReject(
    deleteEquipmentResearchDiscordCard("missing-message"),
  );
});

test("기존 카드 삭제가 404 외 오류면 새 게시 전에 실패시킨다", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/hook/token";
  globalThis.fetch = async () =>
    new Response("Missing Access", { status: 403 });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  await assert.rejects(
    deleteEquipmentResearchDiscordCard("forbidden-message"),
    /연구 카드 삭제 실패 \(403\)/,
  );
});
