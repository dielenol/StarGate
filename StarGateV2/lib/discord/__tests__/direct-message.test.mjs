import assert from "node:assert/strict";
import test from "node:test";

import { sendDiscordDirectMessage } from "../direct-message.ts";

const RECIPIENT_ID = "123456789012345678";
const CHANNEL_ID = "223456789012345678";
const MESSAGE_ID = "323456789012345678";

test("Discord 개인 채널을 열고 mention 없이 멱등 nonce로 DM을 전송한다", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.endsWith("/users/@me/channels")) {
      assert.deepEqual(JSON.parse(init.body), { recipient_id: RECIPIENT_ID });
      return Response.json({ id: CHANNEL_ID });
    }
    if (href.endsWith(`/channels/${CHANNEL_ID}/messages`)) {
      assert.deepEqual(JSON.parse(init.body), {
        content: "견적이 도착했습니다.",
        allowed_mentions: { parse: [] },
        nonce: "quote-request-version-1",
        enforce_nonce: true,
      });
      return Response.json({ id: MESSAGE_ID });
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const result = await sendDiscordDirectMessage(
    {
      recipientId: RECIPIENT_ID,
      content: "견적이 도착했습니다.",
      nonce: "quote-request-version-1",
    },
    {
      botToken: "test-bot-token",
      apiBaseUrl: "https://discord.test/api/v10",
      fetchImpl,
    },
  );

  assert.deepEqual(result, { channelId: CHANNEL_ID, messageId: MESSAGE_ID });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.Authorization, "Bot test-bot-token");
  assert.equal(calls[1].init.headers.Authorization, "Bot test-bot-token");
  assert.match(calls[0].init.headers["User-Agent"], /^DiscordBot \(/);
  assert.equal(
    calls[1].init.headers["User-Agent"],
    calls[0].init.headers["User-Agent"],
  );
});

test("Discord rate limit의 retry_after 이후 DM 채널 생성을 재시도한다", async () => {
  let channelAttempts = 0;
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.endsWith("/users/@me/channels")) {
      channelAttempts += 1;
      if (channelAttempts === 1) {
        return Response.json(
          { message: "rate limited", retry_after: 0 },
          { status: 429 },
        );
      }
      return Response.json({ id: CHANNEL_ID });
    }
    if (href.endsWith(`/channels/${CHANNEL_ID}/messages`)) {
      return Response.json({ id: MESSAGE_ID });
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const result = await sendDiscordDirectMessage(
    { recipientId: RECIPIENT_ID, content: "재시도 테스트" },
    {
      botToken: "test-bot-token",
      apiBaseUrl: "https://discord.test/api/v10",
      fetchImpl,
    },
  );

  assert.equal(result.messageId, MESSAGE_ID);
  assert.equal(channelAttempts, 2);
});

test("메시지 전송 단계의 Discord rate limit도 같은 nonce로 재시도한다", async () => {
  let messageAttempts = 0;
  const payloads = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith("/users/@me/channels")) {
      return Response.json({ id: CHANNEL_ID });
    }
    if (href.endsWith(`/channels/${CHANNEL_ID}/messages`)) {
      messageAttempts += 1;
      payloads.push(JSON.parse(init.body));
      if (messageAttempts === 1) {
        return Response.json(
          { message: "rate limited", retry_after: 0 },
          { status: 429 },
        );
      }
      return Response.json({ id: MESSAGE_ID });
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const result = await sendDiscordDirectMessage(
    {
      recipientId: RECIPIENT_ID,
      content: "메시지 재시도 테스트",
      nonce: "stable-quote-nonce",
    },
    {
      botToken: "test-bot-token",
      apiBaseUrl: "https://discord.test/api/v10",
      fetchImpl,
    },
  );

  assert.equal(result.messageId, MESSAGE_ID);
  assert.equal(messageAttempts, 2);
  assert.equal(payloads[0].nonce, "stable-quote-nonce");
  assert.deepEqual(payloads[1], payloads[0]);
});

test("토큰이나 수신자·메시지가 올바르지 않으면 Discord를 호출하지 않는다", async () => {
  const fetchImpl = async () => {
    throw new Error("호출되면 안 됨");
  };

  await assert.rejects(
    sendDiscordDirectMessage(
      { recipientId: RECIPIENT_ID, content: "견적" },
      { botToken: "", fetchImpl },
    ),
    /DISCORD_BOT_TOKEN/,
  );
  await assert.rejects(
    sendDiscordDirectMessage(
      { recipientId: "not-a-snowflake", content: "견적" },
      { botToken: "test-bot-token", fetchImpl },
    ),
    /수신자 ID/,
  );
  await assert.rejects(
    sendDiscordDirectMessage(
      { recipientId: RECIPIENT_ID, content: "" },
      { botToken: "test-bot-token", fetchImpl },
    ),
    /1~2,000자/,
  );
});

test("Discord 거부 응답은 토큰 없이 제한된 오류 정보만 반환한다", async () => {
  await assert.rejects(
    sendDiscordDirectMessage(
      { recipientId: RECIPIENT_ID, content: "견적" },
      {
        botToken: "never-log-this-token",
        apiBaseUrl: "https://discord.test/api/v10",
        fetchImpl: async () =>
          Response.json(
            { code: 50007, message: "Cannot send messages to this user" },
            { status: 403 },
          ),
      },
    ),
    (error) => {
      assert.match(error.message, /Cannot send messages to this user/);
      assert.doesNotMatch(error.message, /never-log-this-token/);
      return true;
    },
  );
});
