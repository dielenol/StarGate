import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

process.env.DISCORD_TOKEN ||= "test-token";
process.env.DISCORD_CLIENT_ID ||= "test-client-id";
process.env.MONGODB_URI ||= "mongodb://localhost:27017/test";
process.env.TRPG_GUILD_ID ||= "test-guild-id";
process.env.TRPG_FALLBACK_CHANNEL_ID ||= "test-channel-id";
process.env.TRPG_MUSIC_CHANNEL_ID ||= "test-music-channel-id";
process.env.TRPG_WEB_BASE_URL ||= "https://example.test";

const { buildHelpEmbed, handleHelpCommand } = await import(
  "../dist/commands/help.js"
);
const { HelpTopic } = await import("../dist/slash/ko-names.js");

test("전체 도움말은 현재 활성화된 세션·주사위·음악 명령을 모두 안내한다", () => {
  const embed = buildHelpEmbed(HelpTopic.all, "test-music-channel-id").toJSON();
  const text = [
    embed.description,
    ...embed.fields.map((field) => `${field.name}\n${field.value}`),
  ].join("\n");

  assert.match(text, /세션확인/);
  assert.match(text, /\/roll/);
  assert.match(text, /\/r/);
  assert.match(text, /\/음악/);
  assert.match(text, /\/도움말 기능:YouTube 음악/);
});

test("음악 도움말은 전용 채널·상태판·전체 제어 명령과 음질 정책을 설명한다", () => {
  const embed = buildHelpEmbed(
    HelpTopic.music,
    "test-music-channel-id",
  ).toJSON();
  const text = [
    embed.description,
    ...embed.fields.map((field) => `${field.name}\n${field.value}`),
  ].join("\n");

  assert.match(text, /<#test-music-channel-id>/);
  for (const command of [
    "재생",
    "재생목록",
    "일시정지",
    "재개",
    "건너뛰기",
    "반복",
    "초기화",
    "대기열",
    "퇴장",
  ]) {
    assert.match(text, new RegExp(command));
  }
  assert.match(text, /상태판/);
  assert.match(text, /재인코딩 없이/);
  assert.match(text, /볼륨·EQ는 제공하지 않습니다/);
  assert.match(text, /사용자 음량/);
});

test("모든 도움말 임베드는 Discord 필드 길이 제한 안에 있다", () => {
  for (const topic of Object.values(HelpTopic)) {
    const embed = buildHelpEmbed(topic, "test-music-channel-id").toJSON();
    assert.ok(embed.title.length <= 256);
    assert.ok(embed.description.length <= 4_096);
    assert.ok(embed.fields.length <= 25);
    for (const field of embed.fields) {
      assert.ok(field.name.length <= 256);
      assert.ok(field.value.length <= 1_024);
    }
  }
});

test("도움말 응답은 명령을 실행한 사용자에게만 표시한다", async () => {
  const replies = [];
  await handleHelpCommand({
    guildId: "test-guild-id",
    inGuild: () => true,
    options: { getString: () => HelpTopic.dice },
    async reply(payload) {
      replies.push(payload);
    },
  });

  assert.equal(replies.length, 1);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.equal(replies[0].embeds[0].toJSON().title, "🎲 주사위 사용법");
});
