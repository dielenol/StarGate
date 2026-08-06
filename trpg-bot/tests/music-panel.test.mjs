import test from "node:test";
import assert from "node:assert/strict";

import {
  MusicPanel,
  MusicPanelError,
  buildMusicPanelEmbed,
  idleMusicPanelView,
} from "../dist/music/music-panel.js";

function track(index = 1) {
  return {
    videoId: `video-${index}`,
    title: `테스트 곡 ${index}`,
    url: `https://www.youtube.com/watch?v=video-${index}`,
    durationSeconds: 120 + index,
    thumbnailUrl: null,
    isLive: false,
    preferredQualityMode: "opus-passthrough",
    requestedById: `user-${index}`,
    requestedByName: `요청자 ${index}`,
  };
}

test("유휴 상태판은 명령 안내와 자동 갱신 표식을 표시한다", () => {
  const embed = buildMusicPanelEmbed(idleMusicPanelView()).toJSON();
  assert.equal(embed.title, "⏹️ 재생 대기 중");
  assert.match(embed.description, /음악 재생/);
  assert.match(embed.footer.text, /다채봇 음악 상태판/);
});

test("재생 상태판은 현재 곡·음질·요청자와 압축된 대기열을 표시한다", () => {
  const embed = buildMusicPanelEmbed({
    connected: true,
    voiceChannelId: "voice-channel-id",
    current: track(1),
    currentQualityMode: "opus-passthrough",
    upcoming: Array.from({ length: 7 }, (_, index) => track(index + 2)),
    paused: false,
    recentError: null,
    notice: null,
  }).toJSON();

  assert.equal(embed.title, "▶️ 현재 재생 중");
  assert.ok(embed.fields.some((field) => field.value.includes("재인코딩 없음")));
  assert.ok(embed.fields.some((field) => field.value.includes("요청자 1")));
  const queue = embed.fields.find((field) => field.name.includes("총 7곡"));
  assert.ok(queue);
  assert.match(queue.value, /외 2곡/);
});

test("일시정지와 최근 오류도 새 메시지 없이 표현할 수 있다", () => {
  const embed = buildMusicPanelEmbed({
    connected: true,
    voiceChannelId: "voice-channel-id",
    current: track(1),
    currentQualityMode: "opus-transcode",
    upcoming: [],
    paused: true,
    recentError: "앞선 곡의 스트림이 중단되었습니다.",
    notice: null,
  }).toJSON();

  assert.equal(embed.title, "⏸️ 일시정지");
  assert.ok(embed.fields.some((field) => field.name === "최근 재생 오류"));
  assert.ok(embed.fields.some((field) => field.value.includes("1회 변환")));
});

test("기존 상태판을 복구한 뒤 새 메시지 없이 순서대로 수정한다", async () => {
  const editedTitles = [];
  let sendCount = 0;
  const existingMessage = {
    author: { id: "bot-user" },
    embeds: [{ footer: { text: "다채봇 음악 상태판 · 기존 메시지" } }],
    async edit(payload) {
      editedTitles.push(payload.embeds[0].toJSON().title);
      return this;
    },
  };
  const channel = {
    type: 0,
    guildId: "guild-id",
    messages: {
      async fetch() {
        return {
          find(predicate) {
            return predicate(existingMessage) ? existingMessage : undefined;
          },
        };
      },
    },
    async send() {
      sendCount += 1;
      return existingMessage;
    },
  };
  const client = {
    user: { id: "bot-user" },
    channels: { fetch: async () => channel },
  };

  const panel = new MusicPanel(client, "guild-id", "music-channel-id");
  await panel.initialize();
  panel.update({
    connected: true,
    voiceChannelId: "voice-channel-id",
    current: track(1),
    currentQualityMode: null,
    upcoming: [],
    paused: false,
    recentError: null,
    notice: null,
  });
  panel.update({
    connected: true,
    voiceChannelId: "voice-channel-id",
    current: track(1),
    currentQualityMode: "opus-passthrough",
    upcoming: [],
    paused: false,
    recentError: null,
    notice: null,
  });
  await panel.flush();

  assert.equal(sendCount, 0);
  assert.deepEqual(editedTitles, [
    "⏹️ 재생 대기 중",
    "⏳ 재생 준비 중",
    "▶️ 현재 재생 중",
  ]);
});

test("전용 채널 ID가 없으면 공개 메시지를 만들지 않고 음악 준비만 실패한다", async () => {
  let fetchCount = 0;
  const panel = new MusicPanel(
    {
      user: { id: "bot-user" },
      channels: {
        async fetch() {
          fetchCount += 1;
          return null;
        },
      },
    },
    "guild-id",
    undefined,
  );

  await assert.rejects(() => panel.initialize(), MusicPanelError);
  assert.equal(fetchCount, 0);
});
