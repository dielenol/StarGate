import test from "node:test";
import assert from "node:assert/strict";
import { DiscordAPIError, MessageFlags } from "discord.js";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv();

const { buildSecretRollDm, handleSecretRoll } = await import(
  "../dist/commands/secret-roll.js"
);

let clock = 1_000_000;

/** 실제 REST 오류와 같은 클래스 — 50007 분기는 `DiscordAPIError` instanceof 로 판정한다. */
function cannotSendError() {
  return new DiscordAPIError(
    { message: "Cannot send messages to this user", code: 50_007 },
    50_007,
    403,
    "POST",
    "https://discord.com/api/v10/channels/x/messages",
    {},
  );
}

function secretRollInteraction({
  expression = "1d20+5",
  target = { id: "master-1", username: "master", globalName: "마스터", bot: false },
  targetIsMember = true,
  showMe = false,
  rollerId = `roller-${clock}`,
  rollerDisplayName = "플레이어",
  sendImpl,
} = {}) {
  const replies = [];
  const deferred = [];
  const edited = [];
  const sentDms = [];
  const targetUser = {
    ...target,
    async send(payload) {
      if (sendImpl) return sendImpl(payload);
      sentDms.push(payload);
    },
  };
  return {
    replies,
    deferred,
    edited,
    sentDms,
    interaction: {
      guildId: "test-guild-id",
      inGuild: () => true,
      guild: { name: "다채 TRPG" },
      user: { id: rollerId, username: "roller", globalName: null },
      member: { displayName: rollerDisplayName },
      options: {
        getString: () => expression,
        getUser: () => targetUser,
        getMember: () => (targetIsMember ? { id: target.id } : null),
        getBoolean: () => showMe,
      },
      async reply(payload) {
        replies.push(payload);
      },
      async deferReply(payload) {
        deferred.push(payload);
      },
      async editReply(payload) {
        edited.push(payload);
      },
    },
  };
}

function now() {
  return clock;
}

test("비밀 굴림 결과는 대상에게만 DM으로 보내고 굴린 사람에게는 전달 여부만 알린다", async () => {
  clock += 60_000;
  const context = secretRollInteraction();
  await handleSecretRoll(context.interaction, now);

  assert.equal(context.sentDms.length, 1);
  assert.match(
    context.sentDms[0].content,
    /<@roller-\d+>\(플레이어\)님이 다채 TRPG에서 나에게만 보냈습니다/,
    "굴린 사람은 멘션(위장 불가) + 표시 이름으로 밝힌다",
  );
  assert.match(context.sentDms[0].content, /Request: `1d20\+5`/);
  assert.deepEqual(context.sentDms[0].allowedMentions, { parse: [] });
  assert.equal(context.deferred[0].flags, MessageFlags.Ephemeral);
  assert.match(context.edited[0].content, /마스터님에게 비밀 굴림 결과를 DM으로 보냈습니다/);
  assert.doesNotMatch(context.edited[0].content, /Request:/);
});

test("나도보기면 굴린 사람에게도 결과를 비공개로 보여 준다", async () => {
  clock += 60_000;
  const context = secretRollInteraction({ showMe: true });
  await handleSecretRoll(context.interaction, now);
  assert.match(context.edited[0].content, /Request: `1d20\+5`/);
});

test("대상이 DM을 막아 두면(50007) 공개 채널로 보내지 않고 DM 차단 문구로 알린다", async () => {
  clock += 60_000;
  const context = secretRollInteraction({
    sendImpl: async () => {
      throw cannotSendError();
    },
  });
  await handleSecretRoll(context.interaction, now);
  assert.match(context.edited[0].content, /DM을 받지 않아 전달하지 못했습니다/);
  assert.match(context.edited[0].content, /아무에게도 공개되지 않았습니다/);
});

test("나도보기 + DM 차단(50007) + 긴 대상 이름: 비공개 응답도 2000자 안에 들어온다", async () => {
  clock += 60_000;
  const context = secretRollInteraction({
    expression: "20 50d1000",
    rollerDisplayName: "A",
    target: { id: "master-2", username: "m", globalName: "_".repeat(40), bot: false }, // 이스케이프 후 80자
    showMe: true,
    sendImpl: async () => {
      throw cannotSendError();
    },
  });
  await handleSecretRoll(context.interaction, now);
  const content = context.edited[0].content;
  assert.ok(content.length <= 2_000, `editReply length=${content.length}`);
  assert.match(content, /DM을 받지 않아 전달하지 못했습니다/);
  assert.match(content, /Roll #1:/, "결과 본문이 함께 실린다");
});

test("나도보기 + DM 성공 경계: DM 과 비공개 응답이 모두 2000자 안에 들어온다", async () => {
  clock += 60_000;
  const context = secretRollInteraction({
    expression: `20 50d1000 ! ${"주".repeat(150)}`,
    rollerDisplayName: "*".repeat(40),
    target: { id: "master-3", username: "m", globalName: "_".repeat(40), bot: false },
    showMe: true,
  });
  await handleSecretRoll(context.interaction, now);
  assert.equal(context.sentDms.length, 1);
  assert.ok(context.sentDms[0].content.length <= 2_000, `DM length=${context.sentDms[0].content.length}`);
  const content = context.edited[0].content;
  assert.ok(content.length <= 2_000, `editReply length=${content.length}`);
  assert.match(content, /비밀 굴림 결과를 DM으로 보냈습니다/);
  assert.match(content, /Roll #1:/);
});

test("그 외 DM 오류는 일시 오류 문구로 알리고 예외를 올리지 않는다", async () => {
  clock += 60_000;
  const context = secretRollInteraction({
    sendImpl: async () => {
      throw Object.assign(new Error("Internal Server Error"), { code: 500 });
    },
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    await handleSecretRoll(context.interaction, now);
  } finally {
    console.error = originalError;
  }
  assert.match(context.edited[0].content, /^일시 오류로 전달하지 못했습니다\. 결과는 아무에게도 공개되지 않았습니다\./);
  assert.doesNotMatch(context.edited[0].content, /DM을 받지 않아/);
});

test("긴 결과도 머리말을 포함한 DM 전체가 2000자 안에 들어온다", async () => {
  clock += 60_000;
  const context = secretRollInteraction({
    expression: `20 30d100 >= 50 ! ${"주".repeat(150)}`,
    rollerDisplayName: "*".repeat(40), // 이스케이프되면 80자
    showMe: true,
  });
  await handleSecretRoll(context.interaction, now);
  assert.equal(context.sentDms.length, 1);
  const dm = context.sentDms[0].content;
  assert.ok(dm.length <= 2_000, `DM length=${dm.length}`);
  assert.match(dm, /^🔒 \*\*비밀 굴림\*\* — <@roller-\d+>\(/);
  assert.match(dm, /판정: 성공 \d+\/20/, "판정 요약은 잘리지 않는다");
});

test("봇·자기 자신·서버 밖 사용자에게는 보낼 수 없다", async () => {
  clock += 60_000;
  const bot = secretRollInteraction({ target: { id: "bot", username: "bot", globalName: null, bot: true } });
  await handleSecretRoll(bot.interaction, now);
  assert.match(bot.replies[0].content, /봇에게는/);

  const self = secretRollInteraction({
    target: { id: "self", username: "self", globalName: null, bot: false },
    rollerId: "self",
  });
  await handleSecretRoll(self.interaction, now);
  assert.match(self.replies[0].content, /비공개:true/);

  const outsider = secretRollInteraction({ targetIsMember: false });
  await handleSecretRoll(outsider.interaction, now);
  assert.match(outsider.replies[0].content, /서버의 멤버에게만/);
  for (const context of [bot, self, outsider]) {
    assert.equal(context.replies[0].flags, MessageFlags.Ephemeral);
    assert.equal(context.sentDms.length, 0);
  }
});

test("같은 사람은 10초 안에 다시 비밀 굴림을 보낼 수 없다", async () => {
  clock += 60_000;
  const first = secretRollInteraction({ rollerId: "rapid" });
  await handleSecretRoll(first.interaction, now);
  clock += 3_000;
  const second = secretRollInteraction({ rollerId: "rapid" });
  await handleSecretRoll(second.interaction, now);
  assert.match(second.replies[0].content, /7초 뒤에 다시/);
  assert.equal(second.sentDms.length, 0);
});

test("주사위 식 오류는 DM 없이 비공개로 알린다", async () => {
  clock += 60_000;
  const context = secretRollInteraction({ expression: "1d20 5" });
  await handleSecretRoll(context.interaction, now);
  assert.match(context.replies[0].content, /연산자/);
  assert.equal(context.sentDms.length, 0);
});

test("받은 DM 머리말의 이름은 마크다운을 이스케이프하고 굴린 사람 멘션을 싣는다", () => {
  const dm = buildSecretRollDm({
    rollerId: "123456789",
    rollerName: "**운영자**",
    guildName: "[공지](https://evil.example)",
    rollContent: "🎲 결과",
  });
  assert.match(dm, /<@123456789>\(\\\*\\\*운영자\\\*\\\*\)/);
  assert.match(dm, /\\\[공지\\\]/);
});
