import test from "node:test";
import assert from "node:assert/strict";
import { Collection } from "discord.js";

import { buildFfmpegArgs } from "../dist/music/audio-source.js";
import { GuildMusicSession } from "../dist/music/music-service.js";
import {
  MusicUserError,
  normalizeVolumePercent,
} from "../dist/music/types.js";

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}

test("기본 음량에서는 FFmpeg 음량 필터와 seek 인자를 넣지 않는다", () => {
  const args = buildFfmpegArgs("https://media.example/a.webm", {}, 20_000);
  assert.equal(argValue(args, "-filter:a"), null);
  assert.equal(argValue(args, "-ss"), null);
});

test("음량과 이어듣기 지점을 FFmpeg 인자로 반영한다", () => {
  const args = buildFfmpegArgs("https://media.example/a.webm", {}, 20_000, {
    volumePercent: 40,
    seekSeconds: 95.7,
  });
  assert.equal(argValue(args, "-filter:a"), "volume=0.400");
  assert.equal(argValue(args, "-ss"), "95");
  // -ss 는 입력 앞에 와야 디코딩을 건너뛴다
  assert.ok(args.indexOf("-ss") < args.indexOf("-i"));
});

test("증폭도 배율로 전달한다", () => {
  const args = buildFfmpegArgs("https://media.example/a.webm", {}, 20_000, {
    volumePercent: 150,
  });
  assert.equal(argValue(args, "-filter:a"), "volume=1.500");
});

test("허용 범위를 벗어난 음량은 사용자 오류로 거부한다", () => {
  assert.equal(normalizeVolumePercent(0), 0);
  assert.equal(normalizeVolumePercent(200), 200);
  assert.equal(normalizeVolumePercent(87.4), 87);
  for (const value of [-1, 201, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => normalizeVolumePercent(value),
      (error) => error instanceof MusicUserError,
    );
  }
});

class FakePanel {
  constructor() {
    this.views = [];
  }
  update(view) {
    this.views.push(view);
  }
  updateIdle() {}
  async flush() {}
  async initialize() {}
}

class FakePlayer {
  constructor() {
    this.state = { status: "idle" };
    this.listeners = new Map();
    this.played = [];
    this.stopped = 0;
  }
  on(event, handler) {
    this.listeners.set(event, handler);
    return this;
  }
  play(resource) {
    this.played.push(resource);
    this.state = { status: "playing" };
  }
  stop() {
    this.stopped += 1;
    this.state = { status: "idle" };
    return true;
  }
  pause() {
    return true;
  }
  unpause() {
    return true;
  }
  subscribe() {}
}

class FakeConnection {
  constructor() {
    this.state = { status: "ready" };
    this.listeners = new Map();
  }
  on(event, handler) {
    this.listeners.set(event, handler);
    return this;
  }
  subscribe() {}
  destroy() {
    this.state = { status: "destroyed" };
  }
}

function track(index = 1, overrides = {}) {
  return {
    videoId: `video-${index}`,
    title: `곡 ${index}`,
    url: `https://www.youtube.com/watch?v=video-${index}`,
    durationSeconds: 300,
    thumbnailUrl: null,
    isLive: false,
    preferredQualityMode: "opus-passthrough",
    requestedById: "user-1",
    requestedByName: "요청자",
    ...overrides,
  };
}

function createSession(playbackDurationMs = 0) {
  const calls = [];
  const panel = new FakePanel();
  const player = new FakePlayer();
  const session = new GuildMusicSession(
    "guild-id",
    "voice-a",
    new FakeConnection(),
    panel,
    () => undefined,
    player,
    {
      createAudioResource: async (item, options) => {
        calls.push({ videoId: item.videoId, options });
        return {
          resource: { metadata: item, playbackDuration: playbackDurationMs },
          qualityMode: "opus-passthrough",
          dispose: () => undefined,
        };
      },
      idleDisconnectMs: 60_000,
      emptyChannelDisconnectMs: 60_000,
    },
  );
  return { session, panel, player, calls };
}

async function waitFor(predicate, message, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("재생 중이 아니면 음량만 저장하고 곡을 다시 열지 않는다", () => {
  const { session, calls } = createSession();
  const change = session.setVolume(60);
  assert.equal(change.volumePercent, 60);
  assert.equal(change.appliedToCurrentTrack, false);
  assert.equal(session.getVolume(), 60);
  assert.equal(calls.length, 0);
});

test("설정한 음량은 이후 재생하는 곡의 리소스 생성에 전달된다", async () => {
  const { session, calls } = createSession();
  session.setVolume(35);
  session.enqueue(track(1));
  await waitFor(() => calls.length === 1, "첫 곡이 시작되지 않았습니다");
  assert.equal(calls[0].options.volumePercent, 35);
  assert.equal(calls[0].options.seekSeconds, 0);
});

test("재생 중 음량 변경은 현재 위치부터 같은 곡을 다시 연다", async () => {
  const { session, calls, player } = createSession(64_000);
  session.enqueue(track(1));
  await waitFor(() => calls.length === 1, "첫 곡이 시작되지 않았습니다");

  const change = session.setVolume(20);
  assert.equal(change.appliedToCurrentTrack, true);
  assert.equal(change.resumedFromSeconds, 64);
  assert.ok(player.stopped >= 1);

  await waitFor(() => calls.length === 2, "같은 곡을 다시 열지 않았습니다");
  assert.equal(calls[1].videoId, "video-1");
  assert.equal(calls[1].options.volumePercent, 20);
  assert.equal(calls[1].options.seekSeconds, 64);

  const secondChange = session.setVolume(30);
  assert.equal(secondChange.resumedFromSeconds, 128);
  await waitFor(() => calls.length === 3, "재개 위치를 누적해 다시 열지 않았습니다");
  assert.equal(calls[2].options.seekSeconds, 128);
});

test("이어듣기 지점은 한 번만 사용하고 다음 곡에는 넘기지 않는다", async () => {
  const { session, calls } = createSession(30_000);
  session.enqueue(track(1));
  await waitFor(() => calls.length === 1, "첫 곡이 시작되지 않았습니다");
  session.setVolume(50);
  await waitFor(() => calls.length === 2, "같은 곡을 다시 열지 않았습니다");
  assert.equal(calls[1].options.seekSeconds, 30);

  session.enqueue(track(2));
  session.skip();
  await waitFor(() => calls.length === 3, "다음 곡이 시작되지 않았습니다");
  assert.equal(calls[2].videoId, "video-2");
  assert.equal(calls[2].options.seekSeconds, 0);
});

test("라이브 스트림은 위치 탐색 없이 다시 연다", async () => {
  const { session, calls } = createSession(45_000);
  session.enqueue(track(1, { isLive: true, durationSeconds: null }));
  await waitFor(() => calls.length === 1, "첫 곡이 시작되지 않았습니다");
  const change = session.setVolume(80);
  assert.equal(change.appliedToCurrentTrack, true);
  assert.equal(change.resumedFromSeconds, null);
  await waitFor(() => calls.length === 2, "라이브를 다시 열지 않았습니다");
  assert.equal(calls[1].options.seekSeconds, 0);
});

test("같은 음량을 다시 설정하면 재생을 건드리지 않는다", async () => {
  const { session, calls } = createSession(10_000);
  session.enqueue(track(1));
  await waitFor(() => calls.length === 1, "첫 곡이 시작되지 않았습니다");
  const change = session.setVolume(100);
  assert.equal(change.appliedToCurrentTrack, false);
  assert.equal(calls.length, 1);
});

test("상태판 스냅샷에 음량이 실린다", () => {
  const { session, panel } = createSession();
  session.setVolume(45);
  const latest = panel.views.at(-1);
  assert.equal(latest.volumePercent, 45);
});
