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
  buildEquipmentWorkshopDiscordDmContent,
  notifyEquipmentWorkshopDiscordDm,
} = await import("../equipment-workshop-discord-dm.ts");
const dmSource = fs.readFileSync(
  new URL("../equipment-workshop-discord-dm.ts", import.meta.url),
  "utf8",
);
const requestRoute = fs.readFileSync(
  new URL(
    "../../../app/api/erp/equipment-shop/workshop-request/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const playerActionRoute = fs.readFileSync(
  new URL(
    "../../../app/api/erp/equipment-shop/workshop-request/[requestId]/[action]/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const adminActionRoute = fs.readFileSync(
  new URL(
    "../../../app/api/erp/admin/equipment-workshop/[requestId]/[action]/route.ts",
    import.meta.url,
  ),
  "utf8",
);

const INPUT = {
  requestId: "507f1f77bcf86cd799439011",
  event: "QUOTED",
  quoteVersion: 1,
  userId: "507f1f77bcf86cd799439012",
  kind: "upgrade",
  characterCodename: "LEE DONGSIK",
  equipmentName: "공격 방패 - 크레모아 개조형",
  totalCost: 2_200,
  durationMinutes: 4_320,
  specialistWorkflow: [
    { specialistCodename: "TEMPER", task: "본체 보강" },
    { specialistCodename: "TOWASKI", task: "폭발물 마무리" },
  ],
};

test("공방 견적 DM은 비용·시간·복합 담당·아메리 서명을 포함한다", () => {
  const content = buildEquipmentWorkshopDiscordDmContent(
    INPUT,
    "https://erp.example.test/base/",
  );

  assert.match(content, /공방 장비 강화 견적서를 정리했어요/);
  assert.match(content, /LEE DONGSIK/);
  assert.match(content, /2,200 CR/);
  assert.match(content, /72시간 · 3일/);
  assert.match(content, /브리짓 케인 \(TEMPER\).*본체 보강/);
  assert.match(content, /립 토와스키 \(TOWASKI\).*폭발물 마무리/);
  assert.match(
    content,
    /https:\/\/erp\.example\.test\/base\/erp\/equipment-shop\/custom/,
  );
  assert.match(content, /NOVUS ORDO · AMERI/);
});

test("공방의 모든 절차 단계에 전용 DM 문구가 있다", () => {
  const cases = [
    ["REQUESTED", /요청을 접수했어요/],
    ["IN_REVIEW", /요청을 검토 중이에요/],
    ["QUOTED", /견적서를 정리했어요/],
    ["IN_PROGRESS", /작업 문서를 넘겼어요/],
    ["READY", /완료 보고가 도착했어요/],
    ["DECLINED", /견적 거절로 기록했어요/],
    ["REJECTED", /요청이 반려됐어요/],
    ["CANCELLED", /작업을 취소 처리했어요/],
    ["COMPLETED", /수령 처리를 종결했어요/],
  ];

  for (const [event, pattern] of cases) {
    assert.match(
      buildEquipmentWorkshopDiscordDmContent({
        ...INPUT,
        event,
        note: "검토 사유",
      }),
      pattern,
    );
  }

  assert.match(
    buildEquipmentWorkshopDiscordDmContent({
      ...INPUT,
      event: "COMPLETED",
      kind: "reload",
    }),
    /재장전 결재를 종결했어요/,
  );
});

test("공방 상태 전이 라우트는 아메리 outbox만 저장하고 worker가 전달한다", () => {
  assert.match(requestRoute, /createEquipmentWorkshopDiscordDmOutboxEvent/);
  assert.match(requestRoute, /event: "REQUESTED"/);
  assert.doesNotMatch(requestRoute, /drainEquipmentWorkshopDiscordDms/);
  assert.doesNotMatch(adminActionRoute, /drainEquipmentWorkshopDiscordDms/);
  assert.doesNotMatch(playerActionRoute, /drainEquipmentWorkshopDiscordDms/);
});

test("공방 DM은 아메리 전용 봇 토큰으로만 발신한다", () => {
  assert.match(dmSource, /process\.env\.AMERI_DISCORD_BOT_TOKEN/);
  assert.doesNotMatch(dmSource, /process\.env\.DISCORD_BOT_TOKEN/);
});

test("활성 Discord 연결 사용자에게 단계·견적 버전별 nonce로 DM을 전송한다", async () => {
  const calls = [];
  const dependencies = {
    botToken: "ameri-test-token",
    siteBaseUrl: "https://erp.example.test",
    resolveRecipients: async () => ({
      sourceState: "active",
      recipients: [
        { kind: "primary", discordId: "123456789012345678" },
      ],
    }),
    sendDirectMessage: async (input, options) => {
      calls.push({ input, options });
      return {
        channelId: "223456789012345678",
        messageId: "323456789012345678",
      };
    },
  };
  const result = await notifyEquipmentWorkshopDiscordDm(INPUT, dependencies);
  await notifyEquipmentWorkshopDiscordDm(INPUT, dependencies);
  await notifyEquipmentWorkshopDiscordDm(
    { ...INPUT, event: "IN_PROGRESS" },
    dependencies,
  );
  await notifyEquipmentWorkshopDiscordDm(
    { ...INPUT, quoteVersion: INPUT.quoteVersion + 1 },
    dependencies,
  );

  assert.equal(result, "sent");
  assert.equal(calls.length, 4);
  assert.equal(calls[0].input.recipientId, "123456789012345678");
  assert.match(calls[0].input.nonce, /^[a-f0-9]{25}$/);
  assert.equal(calls[0].options.botToken, "ameri-test-token");
  assert.equal(calls[1].input.nonce, calls[0].input.nonce);
  assert.notEqual(calls[2].input.nonce, calls[0].input.nonce);
  assert.notEqual(calls[3].input.nonce, calls[0].input.nonce);
});

test("JTEST 공방 DM은 원 수신자를 유지하면서 DieLenol 미러에 별도 nonce로 전달한다", async () => {
  const calls = [];
  const result = await notifyEquipmentWorkshopDiscordDm(INPUT, {
    botToken: "ameri-test-token",
    resolveRecipients: async () => ({
      sourceState: "active",
      recipients: [
        { kind: "primary", discordId: "123456789012345678" },
        { kind: "mirror", discordId: "423456789012345678" },
      ],
    }),
    sendDirectMessage: async (input) => {
      calls.push(input);
      return {
        channelId: "223456789012345678",
        messageId: "323456789012345678",
      };
    },
  });

  assert.equal(result, "sent");
  assert.deepEqual(
    calls.map(({ recipientId }) => recipientId),
    ["123456789012345678", "423456789012345678"],
  );
  assert.notEqual(calls[0].nonce, calls[1].nonce);
});

test("토큰 미설정·Discord 미연결·비활성 사용자는 외부 DM을 건너뛴다", async () => {
  let lookupCount = 0;
  const noToken = await notifyEquipmentWorkshopDiscordDm(INPUT, {
    botToken: null,
    resolveRecipients: async () => {
      lookupCount += 1;
      return { sourceState: "missing", recipients: [] };
    },
  });
  assert.equal(noToken, "skipped_unconfigured");
  assert.equal(lookupCount, 0);

  const unlinked = await notifyEquipmentWorkshopDiscordDm(INPUT, {
    botToken: "ameri-test-token",
    resolveRecipients: async () => ({
      sourceState: "active",
      recipients: [],
    }),
    sendDirectMessage: async () => {
      throw new Error("호출되면 안 됨");
    },
  });
  assert.equal(unlinked, "skipped_unlinked");

  const inactive = await notifyEquipmentWorkshopDiscordDm(INPUT, {
    botToken: "ameri-test-token",
    resolveRecipients: async () => ({
      sourceState: "inactive",
      recipients: [],
    }),
    sendDirectMessage: async () => {
      throw new Error("호출되면 안 됨");
    },
  });
  assert.equal(inactive, "skipped_inactive");
});
