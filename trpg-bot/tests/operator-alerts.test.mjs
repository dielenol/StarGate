import test from "node:test";
import assert from "node:assert/strict";

import { ChannelType } from "discord.js";

import {
  OperatorAlertService,
  sanitizeOperatorAlertValue,
} from "../dist/utils/operator-alerts.js";

function alertEvent(key = "music-test") {
  return {
    key,
    title: "음악 재생 장애",
    description: "재생 경로를 확인해 주세요.",
    error: new Error(
      "fetch https://media.example.test/audio?token=top-secret token=top-secret",
    ),
    context: {
      길드: "guild-id",
      음성채널: "voice-channel-id",
    },
  };
}

test("운영 알림은 DM과 별도 채널 메시지를 독립 전송하고 중복을 억제한다", async () => {
  let now = 1_000;
  const dmPayloads = [];
  const channelPayloads = [];
  const client = {
    users: {
      async fetch(userId) {
        assert.equal(userId, "operator-user-id");
        return {
          async send(payload) {
            dmPayloads.push(payload);
          },
        };
      },
    },
    channels: {
      async fetch(channelId) {
        assert.equal(channelId, "alert-channel-id");
        return {
          type: ChannelType.GuildText,
          guildId: "guild-id",
          async send(payload) {
            channelPayloads.push(payload);
          },
        };
      },
    },
  };
  const service = new OperatorAlertService(
    client,
    {
      guildId: "guild-id",
      userId: "operator-user-id",
      channelId: "alert-channel-id",
      defaultCooldownMs: 10_000,
    },
    { now: () => now, logError: () => undefined },
  );

  assert.deepEqual(await service.notify(alertEvent()), {
    suppressed: false,
    dm: "sent",
    channel: "sent",
  });
  assert.equal(dmPayloads.length, 1);
  assert.equal(channelPayloads.length, 1);
  const serialized = JSON.stringify(channelPayloads[0].embeds[0].toJSON());
  assert.match(serialized, /다채봇 운영 알림/);
  assert.match(serialized, /\[URL\]/);
  assert.doesNotMatch(serialized, /top-secret/);

  assert.deepEqual(await service.notify(alertEvent()), {
    suppressed: true,
    dm: "disabled",
    channel: "disabled",
  });
  assert.equal(dmPayloads.length, 1);
  assert.equal(channelPayloads.length, 1);

  now += 10_000;
  assert.equal((await service.notify(alertEvent())).suppressed, false);
  assert.equal(dmPayloads.length, 2);
  assert.equal(channelPayloads.length, 2);
});

test("DM이 막혀도 채널 로그는 별도 메시지로 계속 전송한다", async () => {
  const channelPayloads = [];
  const errors = [];
  const service = new OperatorAlertService(
    {
      users: {
        async fetch() {
          throw new Error("DM disabled");
        },
      },
      channels: {
        async fetch() {
          return {
            type: ChannelType.GuildText,
            guildId: "guild-id",
            async send(payload) {
              channelPayloads.push(payload);
            },
          };
        },
      },
    },
    {
      guildId: "guild-id",
      userId: "operator-user-id",
      channelId: "alert-channel-id",
    },
    { logError: (message) => errors.push(message) },
  );

  assert.deepEqual(await service.notify(alertEvent("independent-routes")), {
    suppressed: false,
    dm: "failed",
    channel: "sent",
  });
  assert.equal(channelPayloads.length, 1);
  assert.equal(errors.length, 1);
});

test("운영 알림 문자열은 URL·인증값·여러 줄을 제거한다", () => {
  const sanitized = sanitizeOperatorAlertValue(
    "Authorization: Bearer secret-value\nhttps://example.test/path Cookie=session-value",
  );
  assert.doesNotMatch(sanitized, /secret-value|session-value|example\.test/);
  assert.match(sanitized, /\[REDACTED\]|\[URL\]/);
  assert.doesNotMatch(sanitized, /\n/);
});
