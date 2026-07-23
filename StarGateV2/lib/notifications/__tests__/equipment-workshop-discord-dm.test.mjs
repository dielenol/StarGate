import assert from "node:assert/strict";
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
    if (specifier === "@/lib/equipment-shop/workshop-request") {
      return nextResolve(
        new URL("../../equipment-shop/workshop-request.ts", import.meta.url)
          .href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

const {
  buildEquipmentWorkshopQuoteDiscordDmContent,
  notifyEquipmentWorkshopQuoteDiscordDm,
} = await import("../equipment-workshop-discord-dm.ts");

const INPUT = {
  requestId: "507f1f77bcf86cd799439011",
  quoteVersion: 1,
  userId: "507f1f77bcf86cd799439012",
  kind: "upgrade",
  characterCodename: "LEE DONGSIK",
  resultName: "공격 방패 - 크레모아 개조형",
  totalCost: 2_200,
  durationMinutes: 4_320,
  specialistWorkflow: [
    { specialistCodename: "TEMPER", task: "본체 보강" },
    { specialistCodename: "TOWASKI", task: "폭발물 마무리" },
  ],
};

test("공방 견적 DM은 비용·시간·복합 담당·절대 확인 링크를 포함한다", () => {
  const content = buildEquipmentWorkshopQuoteDiscordDmContent(
    INPUT,
    "https://erp.example.test/base/",
  );

  assert.match(content, /공방 강화 견적이 도착했습니다/);
  assert.match(content, /LEE DONGSIK/);
  assert.match(content, /2,200 CR/);
  assert.match(content, /72시간 · 3일/);
  assert.match(content, /브리짓 케인 \(TEMPER\).*본체 보강/);
  assert.match(content, /립 토와스키 \(TOWASKI\).*폭발물 마무리/);
  assert.match(
    content,
    /https:\/\/erp\.example\.test\/base\/erp\/equipment-shop\/custom/,
  );
});

test("활성 Discord 연결 사용자에게 견적 버전별 deterministic nonce로 DM을 전송한다", async () => {
  const calls = [];
  const dependencies = {
    botToken: "test-bot-token",
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
  const result = await notifyEquipmentWorkshopQuoteDiscordDm(
    INPUT,
    dependencies,
  );
  await notifyEquipmentWorkshopQuoteDiscordDm(INPUT, dependencies);
  await notifyEquipmentWorkshopQuoteDiscordDm(
    { ...INPUT, quoteVersion: INPUT.quoteVersion + 1 },
    dependencies,
  );

  assert.equal(result, "sent");
  assert.equal(calls.length, 3);
  assert.equal(calls[0].input.recipientId, "123456789012345678");
  assert.equal(calls[0].input.nonce.length, 25);
  assert.match(calls[0].input.nonce, /^[a-f0-9]{25}$/);
  assert.equal(calls[0].options.botToken, "test-bot-token");
  assert.equal(calls[1].input.nonce, calls[0].input.nonce);
  assert.notEqual(calls[2].input.nonce, calls[0].input.nonce);
});

test("토큰 미설정·Discord 미연결·비활성 사용자는 외부 DM을 건너뛴다", async () => {
  let lookupCount = 0;
  const noToken = await notifyEquipmentWorkshopQuoteDiscordDm(INPUT, {
    botToken: null,
    findUser: async () => {
      lookupCount += 1;
      return null;
    },
  });
  assert.equal(noToken, "skipped_unconfigured");
  assert.equal(lookupCount, 0);

  const unlinked = await notifyEquipmentWorkshopQuoteDiscordDm(INPUT, {
    botToken: "test-bot-token",
    findUser: async () => ({ status: "ACTIVE", discordId: null }),
    sendDirectMessage: async () => {
      throw new Error("호출되면 안 됨");
    },
  });
  assert.equal(unlinked, "skipped_unlinked");

  const inactive = await notifyEquipmentWorkshopQuoteDiscordDm(INPUT, {
    botToken: "test-bot-token",
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
