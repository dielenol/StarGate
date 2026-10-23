import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType, MessageFlags } from "discord.js";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv({
  TRPG_GUILD_ID: "guild-id",
  TRPG_FALLBACK_CHANNEL_ID: "fallback-channel-id",
  TRPG_MUSIC_CHANNEL_ID: "music-channel-id",
});

const { handleMusicButton, handleMusicCommand, isMusicButtonCustomId } =
  await import("../dist/commands/music.js");
const { MusicRepeatMode } = await import("../dist/music/types.js");

function assertPrivateWithoutEmbeds(flags) {
  assert.ok(flags & MessageFlags.Ephemeral);
  assert.ok(flags & MessageFlags.SuppressEmbeds);
}

function queueInteraction(channelId) {
  const replies = [];
  return {
    replies,
    interaction: {
      commandName: "음악",
      channelId,
      guildId: "guild-id",
      guild: { id: "guild-id" },
      user: { id: "request-user" },
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

function voiceInteraction(subcommand, optionValues = {}) {
  const replies = [];
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
    members: new Map([["request-user", { displayName: "요청자" }]]),
    permissionsFor: () => ({ has: () => true }),
  };
  guild.voiceStates.cache.set("request-user", {
    channel: voiceChannel,
    channelId: voiceChannel.id,
  });
  return {
    replies,
    deferred,
    edited,
    guild,
    voiceChannel,
    interaction: {
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
        getSubcommand: () => subcommand,
        getString: (name) => optionValues[name] ?? null,
        getInteger: (name) => optionValues[name] ?? null,
      },
      async reply(payload) {
        replies.push(payload);
        this.replied = true;
      },
      async deferReply(payload) {
        deferred.push(payload);
        this.deferred = true;
      },
      async editReply(payload) {
        edited.push(payload);
      },
    },
  };
}

test("전용 채널의 대기열 응답은 명령 사용자에게만 표시한다", async () => {
  const { interaction, replies } = queueInteraction("music-channel-id");
  await handleMusicCommand(interaction, { getSnapshot: () => null });

  assert.equal(replies.length, 1);
  assertPrivateWithoutEmbeds(replies[0].flags);
  assert.match(replies[0].content, /재생 중인 음악이 없습니다/);
});

test("다른 채널의 음악 명령은 전용 채널 링크를 비공개로 안내한다", async () => {
  const { interaction, replies } = queueInteraction("general-channel-id");
  await handleMusicCommand(interaction, { getSnapshot: () => null });

  assert.equal(replies.length, 1);
  assertPrivateWithoutEmbeds(replies[0].flags);
  assert.match(replies[0].content, /<#music-channel-id>/);
});

test("예상하지 못한 음악 명령 오류는 사용자 안내와 운영 알림을 함께 처리한다", async () => {
  const { interaction, replies } = queueInteraction("music-channel-id");
  const reports = [];
  await handleMusicCommand(interaction, {
    getSnapshot() {
      throw new Error("unexpected queue error");
    },
    async reportUnexpectedCommandFailure(error, context) {
      reports.push({ error, context });
    },
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].context.userId, "request-user");
  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /오류가 발생/);
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
  assert.equal(edited[0].flags, MessageFlags.SuppressEmbeds);
  assert.match(edited[0].content, /재생을 준비합니다/);
});

test("재생목록은 비공개로 처리하고 추가·제외 곡 수를 안내한다", async () => {
  const context = voiceInteraction("재생목록", {
    링크: "https://youtube.com/playlist?list=test-list",
  });
  let receivedQuery;
  await handleMusicCommand(context.interaction, {
    async resolveAndEnqueuePlaylist(request) {
      receivedQuery = request.query;
      return {
        playlistTitle: "테스트 목록",
        addedCount: 48,
        omittedCount: 2,
        truncated: true,
        startedImmediately: true,
        firstQueuePosition: 0,
      };
    },
  });

  assert.equal(receivedQuery, "https://youtube.com/playlist?list=test-list");
  assert.equal(context.deferred[0].flags, MessageFlags.Ephemeral);
  assert.equal(context.edited[0].flags, MessageFlags.SuppressEmbeds);
  assert.match(context.edited[0].content, /48곡/);
  assert.match(context.edited[0].content, /2곡은 제외/);
});

test("반복 모드와 초기화 결과는 명령 사용자에게만 안내한다", async () => {
  const repeat = voiceInteraction("반복", { 모드: MusicRepeatMode.queue });
  let selectedMode;
  await handleMusicCommand(repeat.interaction, {
    setRepeatMode(_guildId, _voiceChannelId, mode) {
      selectedMode = mode;
      return mode;
    },
  });
  assert.equal(selectedMode, MusicRepeatMode.queue);
  assertPrivateWithoutEmbeds(repeat.replies[0].flags);
  assert.match(repeat.replies[0].content, /대기열 전체/);

  const reset = voiceInteraction("초기화");
  await handleMusicCommand(reset.interaction, {
    async reset() {
      return { removedTracks: 12, cancelledRequests: 1 };
    },
  });
  assert.equal(reset.deferred[0].flags, MessageFlags.Ephemeral);
  assert.equal(reset.edited[0].flags, MessageFlags.SuppressEmbeds);
  assert.match(reset.edited[0].content, /12곡/);
  assert.match(reset.edited[0].content, /1건/);
});

const sampleTrack = {
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

test("제어 명령은 봇의 연결·말하기 권한이 바뀌어도 퇴장·일시정지를 처리한다", async () => {
  const leave = voiceInteraction("퇴장");
  leave.voiceChannel.permissionsFor = () => ({ has: () => false });
  let left = false;
  await handleMusicCommand(leave.interaction, {
    async leave() {
      left = true;
    },
  });
  assert.equal(left, true);
  assert.equal(leave.deferred[0].flags, MessageFlags.Ephemeral);
  assert.match(leave.edited[0].content, /음성 채널에서 나갔습니다/);

  const pause = voiceInteraction("일시정지");
  pause.voiceChannel.permissionsFor = () => ({ has: () => false });
  await handleMusicCommand(pause.interaction, { pause: () => "paused" });
  assert.match(pause.replies[0].content, /일시정지했습니다/);
});

test("곡을 준비하는 중 일시정지하면 재생이 시작되는 즉시 멈춘다고 안내한다", async () => {
  const pause = voiceInteraction("일시정지");
  await handleMusicCommand(pause.interaction, { pause: () => "pending" });
  assertPrivateWithoutEmbeds(pause.replies[0].flags);
  assert.match(pause.replies[0].content, /재생이 시작되는 즉시 일시정지/);
});

test("셔플과 번호 삭제 결과를 명령 사용자에게만 안내한다", async () => {
  const shuffle = voiceInteraction("셔플");
  await handleMusicCommand(shuffle.interaction, { shuffle: () => 5 });
  assertPrivateWithoutEmbeds(shuffle.replies[0].flags);
  assert.match(shuffle.replies[0].content, /5곡의 순서를 섞었습니다/);

  const remove = voiceInteraction("삭제", { 번호: 3 });
  let removedPosition;
  await handleMusicCommand(remove.interaction, {
    removeAt(_guildId, _voiceChannelId, position) {
      removedPosition = position;
      return sampleTrack;
    },
  });
  assert.equal(removedPosition, 3);
  assert.match(remove.replies[0].content, /대기열 3번 \[테스트 음악\]/);
});

test("음량을 바꿔도 일시정지가 유지되면 그 사실을 안내한다", async () => {
  const volume = voiceInteraction("볼륨", { 퍼센트: 50 });
  await handleMusicCommand(volume.interaction, {
    setVolume: () => ({
      volumePercent: 50,
      previousVolumePercent: 100,
      appliedToCurrentTrack: true,
      resumedFromSeconds: 30,
      keptPaused: true,
      track: sampleTrack,
    }),
  });
  assert.match(volume.replies[0].content, /일시정지 상태는 그대로 유지됩니다/);
});

function buttonInteraction(customId) {
  const { interaction, replies, voiceChannel } = voiceInteraction("버튼");
  const updates = [];
  return {
    replies,
    updates,
    voiceChannel,
    interaction: {
      ...interaction,
      customId,
      async reply(payload) {
        replies.push(payload);
        this.replied = true;
      },
      async deferUpdate() {
        updates.push(true);
      },
    },
  };
}

test("상태판 버튼은 같은 음성 채널 사용자의 제어를 반영하고 응답 없이 확인한다", async () => {
  const skip = buttonInteraction("trpg:music:v1:skip");
  let skipped = false;
  await handleMusicButton(skip.interaction, {
    skip() {
      skipped = true;
      return sampleTrack;
    },
  });
  assert.equal(skipped, true);
  assert.equal(skip.updates.length, 1);
  assert.equal(skip.replies.length, 0);

  const toggle = buttonInteraction("trpg:music:v1:toggle-pause");
  let resumed = false;
  await handleMusicButton(toggle.interaction, {
    getSnapshot: () => ({ paused: true }),
    resume() {
      resumed = true;
      return true;
    },
  });
  assert.equal(resumed, true);

  const repeat = buttonInteraction("trpg:music:v1:repeat");
  let nextMode;
  await handleMusicButton(repeat.interaction, {
    getSnapshot: () => ({ repeatMode: MusicRepeatMode.track }),
    setRepeatMode(_guildId, _voiceChannelId, mode) {
      nextMode = mode;
      return mode;
    },
  });
  assert.equal(nextMode, MusicRepeatMode.queue);
});

test("상태판 버튼의 사용자 오류는 누른 사람에게만 비공개로 안내한다", async () => {
  const skip = buttonInteraction("trpg:music:v1:skip");
  await handleMusicButton(skip.interaction, { skip: () => null });
  assert.equal(skip.updates.length, 0);
  assertPrivateWithoutEmbeds(skip.replies[0].flags);
  assert.match(skip.replies[0].content, /건너뛸 음악이 없습니다/);
});

test("다른 버튼 customId 는 음악 버튼으로 처리하지 않는다", () => {
  assert.equal(isMusicButtonCustomId("trpg:music:v1:skip"), true);
  assert.equal(isMusicButtonCustomId("trpg:music:v0:skip"), false);
  assert.equal(isMusicButtonCustomId("trpg:session-check:v1:next"), false);
});
