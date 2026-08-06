import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType, MessageFlags } from "discord.js";

process.env.DISCORD_TOKEN ||= "test-token";
process.env.DISCORD_CLIENT_ID ||= "test-client-id";
process.env.MONGODB_URI ||= "mongodb://localhost:27017/test";
process.env.TRPG_GUILD_ID ||= "guild-id";
process.env.TRPG_FALLBACK_CHANNEL_ID ||= "fallback-channel-id";
process.env.TRPG_MUSIC_CHANNEL_ID ||= "music-channel-id";
process.env.TRPG_WEB_BASE_URL ||= "https://example.test";

const { handleMusicCommand } = await import("../dist/commands/music.js");

function queueInteraction(channelId) {
  const replies = [];
  return {
    replies,
    interaction: {
      commandName: "음악",
      channelId,
      guildId: "guild-id",
      guild: { id: "guild-id" },
      deferred: false,
      replied: false,
      inGuild: () => true,
      options: { getSubcommand: () => "대기열" },
      async reply(payload) {
        replies.push(payload);
      },
    },
  };
}

test("전용 채널의 대기열 응답은 명령 사용자에게만 표시한다", async () => {
  const { interaction, replies } = queueInteraction("music-channel-id");
  await handleMusicCommand(interaction, { getSnapshot: () => null });

  assert.equal(replies.length, 1);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.match(replies[0].content, /재생 중인 음악이 없습니다/);
});

test("다른 채널의 음악 명령은 전용 채널 링크를 비공개로 안내한다", async () => {
  const { interaction, replies } = queueInteraction("general-channel-id");
  await handleMusicCommand(interaction, { getSnapshot: () => null });

  assert.equal(replies.length, 1);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.match(replies[0].content, /<#music-channel-id>/);
});

test("재생 요청도 처음부터 비공개로 defer한 뒤 같은 응답을 수정한다", async () => {
  const deferred = [];
  const edited = [];
  const guild = {
    id: "guild-id",
    voiceStates: { cache: new Map() },
    members: { me: { id: "bot-user" } },
  };
  const voiceChannel = {
    id: "voice-channel-id",
    type: ChannelType.GuildVoice,
    guild,
    members: new Map([
      ["request-user", { displayName: "요청자" }],
    ]),
    permissionsFor: () => ({ has: () => true }),
  };
  guild.voiceStates.cache.set("request-user", { channel: voiceChannel });
  const interaction = {
    commandName: "음악",
    channelId: "music-channel-id",
    guildId: "guild-id",
    guild,
    user: {
      id: "request-user",
      username: "request-user",
      globalName: null,
    },
    deferred: false,
    replied: false,
    inGuild: () => true,
    options: {
      getSubcommand: () => "재생",
      getString: () => "테스트 음악",
    },
    async deferReply(payload) {
      deferred.push(payload);
      this.deferred = true;
    },
    async editReply(payload) {
      edited.push(payload);
    },
  };
  const requestedTrack = {
    videoId: "video-id",
    title: "테스트 음악",
    url: "https://www.youtube.com/watch?v=video-id",
    durationSeconds: 120,
    thumbnailUrl: null,
    isLive: false,
    preferredQualityMode: "opus-passthrough",
    requestedById: "request-user",
    requestedByName: "요청자",
  };
  const service = {
    async resolveAndEnqueue() {
      return {
        track: requestedTrack,
        startedImmediately: true,
        queuePosition: 0,
      };
    },
  };

  await handleMusicCommand(interaction, service);

  assert.equal(deferred[0].flags, MessageFlags.Ephemeral);
  assert.equal(edited.length, 1);
  assert.match(edited[0].content, /재생을 준비합니다/);
});
