import assert from "node:assert/strict";
import test from "node:test";

import { ObjectId } from "mongodb";

import {
  IntegrationOutboxConfigurationError,
  createDiscordIntegrationOutboxHandlers,
} from "../dist/outbox/discord-handlers.js";

function outboxEvent(kind, payload) {
  return {
    _id: new ObjectId(),
    kind,
    dedupeKey: `${kind}:test`,
    version: 1,
    payload,
    status: "PROCESSING",
    attempts: 1,
    availableAt: new Date(),
    leaseToken: "lease",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test("활성화한 webhook과 거래 DM kind는 실제 Discord REST payload를 만든다", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (String(url).endsWith("/users/@me/channels")) {
      return new Response(
        JSON.stringify({ id: "12345678901234567" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ id: "22345678901234567" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const registry = createDiscordIntegrationOutboxHandlers(
    {
      WORKER_OUTBOX_KINDS: "GM_ADMIN_AUDIT,PLAYER_TRADE_DM",
      DISCORD_WEBHOOK_CHAR_EDIT_URL:
        "https://discord.com/api/webhooks/example/token",
      REGISTRAR_DISCORD_BOT_TOKEN: "test-token",
      NEXT_PUBLIC_SITE_URL: "https://www.ordonet.co.kr",
    },
    {
      fetchImpl,
      async resolveRecipients() {
        return {
          sourceState: "active",
          recipients: [
            { kind: "primary", discordId: "32345678901234567" },
          ],
        };
      },
    },
  );

  await registry.get("GM_ADMIN_AUDIT").deliver(
    outboxEvent("GM_ADMIN_AUDIT", {
      action: "권한 변경",
      actor: { id: "gm-id", displayName: "GM", role: "GM" },
      summary: "@everyone 테스트",
      timestamp: new Date().toISOString(),
    }),
  );
  await registry.get("PLAYER_TRADE_DM").deliver(
    outboxEvent("PLAYER_TRADE_DM", {
      tradeId: "trade-1",
      event: "EXCHANGE_COMPLETED",
      userId: "user-id",
      recipientCodename: "JTEST",
      otherCharacterCodename: "GTEST",
    }),
  );

  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].body.allowed_mentions, { parse: [] });
  assert.match(requests[0].body.embeds[0].fields[0].value, /@​everyone/);
  assert.equal(requests[2].body.enforce_nonce, true);
  assert.equal(requests[2].body.nonce.length, 25);
});

test("JTEST 거래 DM은 기존 수신자와 DieLenol 미러에 각각 한 번 전달한다", async () => {
  const requests = [];
  const registry = createDiscordIntegrationOutboxHandlers(
    {
      WORKER_OUTBOX_KINDS: "PLAYER_TRADE_DM",
      REGISTRAR_DISCORD_BOT_TOKEN: "test-token",
    },
    {
      async resolveRecipients() {
        return {
          sourceState: "active",
          recipients: [
            { kind: "primary", discordId: "32345678901234567" },
            { kind: "mirror", discordId: "42345678901234567" },
          ],
        };
      },
      async fetchImpl(url, init) {
        requests.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if (String(url).endsWith("/users/@me/channels")) {
          return new Response(
            JSON.stringify({
              id:
                requests.length === 1
                  ? "52345678901234567"
                  : "62345678901234567",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ id: "72345678901234567" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  await registry.get("PLAYER_TRADE_DM").deliver(
    outboxEvent("PLAYER_TRADE_DM", {
      tradeId: "trade-mirror",
      event: "EXCHANGE_COMPLETED",
      userId: "jtest-user-id",
      recipientCodename: "JTEST",
      otherCharacterCodename: "GTEST",
    }),
  );

  assert.equal(requests.length, 4);
  assert.deepEqual(
    [requests[0].body.recipient_id, requests[2].body.recipient_id],
    ["32345678901234567", "42345678901234567"],
  );
  assert.notEqual(requests[1].body.nonce, requests[3].body.nonce);
});

test("활성화한 kind의 secret이 없으면 claim 전에 설정 오류를 낸다", () => {
  assert.throws(
    () =>
      createDiscordIntegrationOutboxHandlers({
        WORKER_OUTBOX_KINDS: "PLAYER_TRADE_DM",
      }),
    IntegrationOutboxConfigurationError,
  );
});

test("수동 주가 조정 공시는 전용 webhook payload로 전달한다", async () => {
  const requests = [];
  const registry = createDiscordIntegrationOutboxHandlers(
    {
      WORKER_OUTBOX_KINDS: "STOCK_MANUAL_INTERVENTION_WEBHOOK",
      DISCORD_WEBHOOK_STOCK_URL:
        "https://discord.com/api/webhooks/stock/token",
    },
    {
      async fetchImpl(url, init) {
        requests.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(null, { status: 204 });
      },
    },
  );

  await registry.get("STOCK_MANUAL_INTERVENTION_WEBHOOK").deliver(
    outboxEvent("STOCK_MANUAL_INTERVENTION_WEBHOOK", {
      ticker: "NVS",
      previousPrice: 100,
      price: 125,
      eventText: "시장 안정화 조치",
      actor: { displayName: "GM", role: "GM" },
      occurredAt: new Date().toISOString(),
    }),
  );

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    "https://discord.com/api/webhooks/stock/token?wait=true",
  );
  assert.equal(
    requests[0].body.embeds[0].title,
    "재무기구 특별 시세 공시",
  );
  assert.deepEqual(requests[0].body.allowed_mentions, { parse: [] });
});
