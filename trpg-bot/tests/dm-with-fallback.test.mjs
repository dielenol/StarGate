/**
 * `sendDmOrFallback` 의 DM 실패 분기 테스트 (Discord 없이 가짜 client).
 *
 *   - 10013 (Unknown User): 폴백 없이 failed
 *   - 50007 (Cannot send messages to this user): 폴백
 *   - 그 밖의 모든 실패(다른 API 코드·네트워크·타임아웃): 재시도 없이 폴백
 *   - allowFallback: false 면 폴백 없이 failed
 *   - 앱 레벨 재시도는 없다 (REST 계층이 AbortError·ECONNRESET 을 재시도한다)
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ChannelType, DiscordAPIError } from "discord.js";

import {
  discordErrorCode,
  sendDmOrFallback,
} from "../dist/utils/dm-with-fallback.js";

const PAYLOAD = { embeds: [{ title: "알림" }] };
const OPTIONS = { fallbackChannelId: "fallback-channel", mentionUser: true };

/** 실제 REST 오류와 같은 클래스 — `discordErrorCode` 는 instanceof 로 판정한다. */
function discordError(code, message = `code ${code}`) {
  return new DiscordAPIError(
    { message, code },
    code,
    code === 10013 ? 404 : 403,
    "POST",
    "https://discord.com/api/v10/channels/x/messages",
    {},
  );
}

/**
 * 가짜 client. `dmErrors` 는 DM 시도 순서대로 던질 오류 (undefined 면 성공).
 */
function fakeClient(dmErrors) {
  const calls = { dm: 0, channelFetch: 0, channelSend: [] };
  const client = {
    users: {
      async fetch() {
        return {
          async send() {
            const err = dmErrors[calls.dm];
            calls.dm += 1;
            if (err) throw err;
          },
        };
      },
    },
    channels: {
      async fetch() {
        calls.channelFetch += 1;
        return {
          type: ChannelType.GuildText,
          isDMBased: () => false,
          isTextBased: () => true,
          async send(payload) {
            calls.channelSend.push(payload);
          },
        };
      },
    },
  };
  return { client, calls };
}

test("discordErrorCode 는 DiscordAPIError 의 숫자 코드만 인정한다", () => {
  assert.equal(discordErrorCode(discordError(50007)), 50007);
  assert.equal(discordErrorCode(new DOMException("x", "AbortError")), null, "legacy code 20 은 API 코드가 아니다");
  assert.equal(discordErrorCode(new DOMException("x", "TimeoutError")), null);
  assert.equal(discordErrorCode(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })), null);
  assert.equal(discordErrorCode(Object.assign(new Error("plain"), { code: 50007 })), null, "클래스가 다르면 인정하지 않는다");
  assert.equal(discordErrorCode(null), null);
});

test("DM 성공이면 폴백 채널을 조회하지 않는다", async () => {
  const { client, calls } = fakeClient([]);
  const result = await sendDmOrFallback(client, "u1", PAYLOAD, OPTIONS);
  assert.deepEqual(result, { method: "dm" });
  assert.equal(calls.channelFetch, 0);
});

test("50007 이면 바로 폴백 채널에 멘션을 보낸다", async () => {
  const { client, calls } = fakeClient([discordError(50007, "Cannot send messages to this user")]);
  const result = await sendDmOrFallback(client, "u1", PAYLOAD, OPTIONS);
  assert.equal(result.method, "fallback");
  assert.match(result.error, /Cannot send messages/);
  assert.equal(calls.dm, 1);
  assert.equal(calls.channelSend.length, 1);
  assert.equal(calls.channelSend[0].content, "<@u1>");
  assert.deepEqual(calls.channelSend[0].embeds, PAYLOAD.embeds);
});

test("10013 (Unknown User) 이면 폴백 없이 failed, 결과에 코드를 싣는다", async () => {
  const { client, calls } = fakeClient([discordError(10013, "Unknown User")]);
  const result = await sendDmOrFallback(client, "u1", PAYLOAD, OPTIONS);
  assert.equal(result.method, "failed");
  assert.equal(result.code, 10013);
  assert.match(result.error, /Unknown User/);
  assert.equal(calls.dm, 1);
  assert.equal(calls.channelFetch, 0);
});

test("타임아웃(DOMException AbortError)은 재시도 없이 send 1회 뒤 폴백", async () => {
  const { client, calls } = fakeClient([new DOMException("This operation was aborted", "AbortError")]);
  const result = await sendDmOrFallback(client, "u1", PAYLOAD, OPTIONS);
  assert.equal(result.method, "fallback");
  assert.equal(result.code, undefined, "API 코드가 아니므로 싣지 않는다");
  assert.match(result.error, /AbortError/);
  assert.equal(calls.dm, 1, "앱 레벨 재시도는 없다");
  assert.equal(calls.channelSend.length, 1);
});

test("ECONNRESET 계열 네트워크 오류도 재시도 없이 폴백", async () => {
  const { client, calls } = fakeClient([
    Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
  ]);
  const result = await sendDmOrFallback(client, "u1", PAYLOAD, OPTIONS);
  assert.equal(result.method, "fallback");
  assert.equal(result.code, undefined);
  assert.equal(calls.dm, 1);
  assert.equal(calls.channelSend.length, 1);
});

test("그 밖의 API 오류(50035·5xx 코드)는 재시도 없이 바로 폴백", async () => {
  for (const code of [50035, 500]) {
    const { client, calls } = fakeClient([discordError(code)]);
    const result = await sendDmOrFallback(client, "u1", PAYLOAD, OPTIONS);
    assert.equal(result.method, "fallback", `code ${code}`);
    assert.equal(calls.dm, 1, `code ${code}: 같은 입력을 다시 보내지 않는다`);
    assert.equal(calls.channelSend.length, 1);
  }
});

test("allowFallback: false 면 DM 실패 후 폴백 없이 failed (코드 포함)", async () => {
  const { client, calls } = fakeClient([discordError(50007)]);
  const result = await sendDmOrFallback(client, "u1", PAYLOAD, {
    ...OPTIONS,
    allowFallback: false,
  });
  assert.equal(result.method, "failed");
  assert.equal(result.code, 50007);
  assert.match(result.error, /code 50007/);
  assert.equal(calls.channelFetch, 0);
});
