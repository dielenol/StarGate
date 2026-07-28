import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/db/users") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function findUserById(){return null}",
      };
    }
    if (specifier === "@/lib/discord/direct-message") {
      return nextResolve(
        new URL("../../discord/direct-message.ts", import.meta.url).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

const {
  buildPlayerTradeDiscordDmContent,
  notifyPlayerTradeDiscordDm,
} = await import("../player-trade-discord-dm.ts");
const createRoute = fs.readFileSync(
  new URL("../../../app/api/erp/trades/route.ts", import.meta.url),
  "utf8",
);
const actionRoute = fs.readFileSync(
  new URL(
    "../../../app/api/erp/trades/[tradeId]/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const dmSource = fs.readFileSync(
  new URL("../player-trade-discord-dm.ts", import.meta.url),
  "utf8",
);

const BASE_INPUT = {
  tradeId: "507f1f77bcf86cd799439011",
  event: "EXCHANGE_OPENED",
  userId: "507f1f77bcf86cd799439012",
  recipientCodename: "INDEXER",
  otherCharacterCodename: "LEE_DONGSIK",
  offer: {
    credits: 1_500,
    items: [
      {
        itemId: "507f1f77bcf86cd799439013",
        itemName: "응급 키트",
        quantity: 2,
      },
    ],
    stocks: [{ ticker: "NOSB", shares: 3 }],
  },
};

test("교환 요청 DM은 레지스트라 행정 문체와 자산 대장 링크를 사용한다", () => {
  const content = buildPlayerTradeDiscordDmContent(
    BASE_INPUT,
    "https://erp.example.test/base/",
  );

  assert.match(content, /자산 교환 요청이 대장에 등재되었습니다/);
  assert.match(content, /INDEXER님/);
  assert.match(content, /LEE\\_DONGSIK 측/);
  assert.match(content, /1,500 CR/);
  assert.match(content, /응급 키트 × 2/);
  assert.match(content, /NOSB 3주/);
  assert.match(
    content,
    /https:\/\/erp\.example\.test\/base\/erp\/trades/,
  );
  assert.match(content, /NOVUS ORDO · REGISTRAR/);
});

test("거래 생성·완료·취소 라우트가 레지스트라 DM을 outbox에 기록한다", () => {
  assert.match(createRoute, /enqueuePlayerTradeDiscordDm\(\{/);
  assert.match(createRoute, /"GIFT_RECEIVED"/);
  assert.match(createRoute, /"EXCHANGE_OPENED"/);
  assert.match(createRoute, /offer: trade\.initiatorOffer/);
  assert.match(actionRoute, /enqueuePlayerTradeDiscordDm\(\{/);
  assert.match(actionRoute, /"EXCHANGE_COMPLETED"/);
  assert.match(actionRoute, /"EXCHANGE_CANCELLED"/);
});

test("개인 거래 DM은 레지스트라 전용 봇 토큰으로만 발신한다", () => {
  assert.match(dmSource, /process\.env\.REGISTRAR_DISCORD_BOT_TOKEN/);
  assert.doesNotMatch(dmSource, /process\.env\.DISCORD_BOT_TOKEN/);
});

test("선물·완료·취소 DM은 절차 상태에 맞는 레지스트라 문구를 사용한다", () => {
  const gift = buildPlayerTradeDiscordDmContent({
    ...BASE_INPUT,
    event: "GIFT_RECEIVED",
  });
  const completed = buildPlayerTradeDiscordDmContent({
    ...BASE_INPUT,
    event: "EXCHANGE_COMPLETED",
    offer: undefined,
  });
  const cancelled = buildPlayerTradeDiscordDmContent({
    ...BASE_INPUT,
    event: "EXCHANGE_CANCELLED",
    offer: undefined,
  });

  assert.match(gift, /자산 전달이 대장에 확정되었습니다/);
  assert.match(gift, /별도 회신은 필요하지 않습니다/);
  assert.match(completed, /양측 확인이 일치하여 체결되었습니다/);
  assert.match(completed, /별도 절차 없이는 허용되지 않습니다/);
  assert.match(cancelled, /취소·종결되었습니다/);
  assert.match(cancelled, /즉시 효력을 상실/);
});

test("활성 Discord 연결 사용자에게 거래 이벤트별 deterministic nonce로 DM을 전송한다", async () => {
  const calls = [];
  const dependencies = {
    botToken: "registrar-test-token",
    siteBaseUrl: "https://erp.example.test",
    findUser: async () => ({
      status: "ACTIVE",
      discordId: "123456789012345678",
    }),
    sendDirectMessage: async (input, options) => {
      calls.push({ input, options });
      return {
        channelId: "223456789012345678",
        messageId: "323456789012345678",
      };
    },
  };

  const result = await notifyPlayerTradeDiscordDm(
    BASE_INPUT,
    dependencies,
  );
  await notifyPlayerTradeDiscordDm(BASE_INPUT, dependencies);
  await notifyPlayerTradeDiscordDm(
    { ...BASE_INPUT, event: "GIFT_RECEIVED" },
    dependencies,
  );

  assert.equal(result, "sent");
  assert.equal(calls.length, 3);
  assert.equal(calls[0].input.recipientId, "123456789012345678");
  assert.match(calls[0].input.nonce, /^[a-f0-9]{25}$/);
  assert.equal(calls[0].input.nonce, calls[1].input.nonce);
  assert.notEqual(calls[0].input.nonce, calls[2].input.nonce);
  assert.equal(
    calls[0].options.botToken,
    "registrar-test-token",
  );
});

test("토큰 미설정·Discord 미연결·비활성 사용자는 거래 DM을 건너뛴다", async () => {
  let lookupCount = 0;
  const noToken = await notifyPlayerTradeDiscordDm(BASE_INPUT, {
    botToken: null,
    findUser: async () => {
      lookupCount += 1;
      return null;
    },
  });
  assert.equal(noToken, "skipped_unconfigured");
  assert.equal(lookupCount, 0);

  const unlinked = await notifyPlayerTradeDiscordDm(BASE_INPUT, {
    botToken: "registrar-test-token",
    findUser: async () => ({ status: "ACTIVE", discordId: null }),
    sendDirectMessage: async () => {
      throw new Error("호출되면 안 됨");
    },
  });
  assert.equal(unlinked, "skipped_unlinked");

  const inactive = await notifyPlayerTradeDiscordDm(BASE_INPUT, {
    botToken: "registrar-test-token",
    findUser: async () => ({
      status: "INACTIVE",
      discordId: "123456789012345678",
    }),
    sendDirectMessage: async () => {
      throw new Error("호출되면 안 됨");
    },
  });
  assert.equal(inactive, "skipped_inactive");
});
