import assert from "node:assert/strict";
import test from "node:test";

import { pruneDiscordWebhookMessages } from "../webhook-message-pruner.ts";

test("현재 메시지는 보존하고 같은 웹훅의 과거 대상 메시지만 실제 삭제한다", async () => {
  const calls = [];
  const messages = [
    { id: "200", webhook_id: "hook" },
    { id: "100", webhook_id: "hook" },
    { id: "110", webhook_id: "hook" },
    { id: "90", webhook_id: "other" },
    { id: "300", webhook_id: "hook" },
  ];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, method: init.method ?? "GET", headers: init.headers });
    if (href === "https://discord.test/api/webhooks/hook/token") {
      return Response.json({ id: "hook", channel_id: "channel" });
    }
    if (href.includes("/channels/channel/messages")) {
      return Response.json(messages);
    }
    if (href.endsWith("/messages/100") && init.method === "GET") {
      return Response.json({
        id: "100",
        embeds: [{ title: "편의점 입고 알림" }],
      });
    }
    if (href.endsWith("/messages/110") && init.method === "GET") {
      return Response.json({
        id: "110",
        embeds: [{ title: "편의점 추가 입고 완료" }],
      });
    }
    if (href.endsWith("/messages/100") && init.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch: ${init.method ?? "GET"} ${href}`);
  };

  const result = await pruneDiscordWebhookMessages({
    webhookUrl: "https://discord.test/api/webhooks/hook/token?wait=true",
    botToken: "bot-token",
    apiBaseUrl: "https://discord.test/api/v10",
    keepMessageIds: ["200"],
    matches: (message) =>
      message.embeds?.some((embed) => embed.title === "편의점 입고 알림") ??
      false,
    fetchImpl,
  });

  assert.equal(result.status, "deleted");
  assert.equal(result.scannedCount, 5);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.deletedCount, 1);
  assert.equal(
    calls.filter((call) => call.method === "DELETE").length,
    1,
  );
  assert.equal(
    calls.some((call) =>
      String(call.headers?.Authorization).includes("bot-token"),
    ),
    true,
  );
  const historyUrl = new URL(
    calls.find((call) => call.href.includes("/channels/channel/messages")).href,
  );
  assert.equal(historyUrl.searchParams.get("before"), "200");
  assert.equal(
    calls.some((call) => call.href.endsWith("/messages/300")),
    false,
  );
});

test("봇 토큰이 없으면 과거 메시지를 건드리지 않고 실패한다", async () => {
  await assert.rejects(
    pruneDiscordWebhookMessages({
      webhookUrl: "https://discord.test/api/webhooks/hook/token",
      botToken: "",
      keepMessageIds: [],
      matches: () => true,
      fetchImpl: async () => {
        throw new Error("호출되면 안 됨");
      },
    }),
    /DISCORD_BOT_TOKEN/,
  );
});

test("Discord 429의 retry_after를 따른 뒤 채널 조회를 재시도한다", async () => {
  let channelAttempts = 0;
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href === "https://discord.test/api/webhooks/hook/token") {
      return Response.json({ id: "hook", channel_id: "channel" });
    }
    if (href.includes("/channels/channel/messages")) {
      channelAttempts += 1;
      if (channelAttempts === 1) {
        return Response.json(
          { message: "rate limited", retry_after: 0, global: false },
          { status: 429 },
        );
      }
      return Response.json([]);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const result = await pruneDiscordWebhookMessages({
    webhookUrl: "https://discord.test/api/webhooks/hook/token",
    botToken: "bot-token",
    apiBaseUrl: "https://discord.test/api/v10",
    keepMessageIds: ["200"],
    matches: () => true,
    fetchImpl,
  });

  assert.equal(result.status, "idle");
  assert.equal(channelAttempts, 2);
});
