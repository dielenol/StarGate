import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  AudioPlayerStatus,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { Collection } from "discord.js";

import {
  GuildMusicSession,
  MusicService,
} from "../dist/music/music-service.js";
import {
  MusicRepeatMode,
  MusicOperationAbortedError,
  MusicUserError,
} from "../dist/music/types.js";

class FakePlayer extends EventEmitter {
  state = { status: AudioPlayerStatus.Idle };
  played = [];
  stopCalls = 0;

  transition(status) {
    const oldState = this.state;
    const newState = { status };
    this.state = newState;
    this.emit("stateChange", oldState, newState);
  }

  play(resource) {
    this.played.push(resource);
    this.transition(AudioPlayerStatus.Playing);
  }

  stop() {
    this.stopCalls += 1;
    if (this.state.status === AudioPlayerStatus.Idle) return false;
    this.transition(AudioPlayerStatus.Idle);
    return true;
  }

  pause() {
    if (this.state.status !== AudioPlayerStatus.Playing) return false;
    this.transition(AudioPlayerStatus.Paused);
    return true;
  }

  unpause() {
    if (
      this.state.status !== AudioPlayerStatus.Paused &&
      this.state.status !== AudioPlayerStatus.AutoPaused
    ) {
      return false;
    }
    this.transition(AudioPlayerStatus.Playing);
    return true;
  }

  finish() {
    this.transition(AudioPlayerStatus.Idle);
  }
}

class FakeConnection extends EventEmitter {
  state = { status: VoiceConnectionStatus.Ready };
  rejoinAttempts = 0;
  subscribedPlayer = null;

  subscribe(player) {
    this.subscribedPlayer = player;
    return { unsubscribe() {} };
  }

  rejoin() {
    return false;
  }

  destroy() {
    if (this.state.status === VoiceConnectionStatus.Destroyed) return;
    const oldState = this.state;
    const newState = { status: VoiceConnectionStatus.Destroyed };
    this.state = newState;
    this.emit("stateChange", oldState, newState);
  }
}

class FakePanel {
  views = [];
  initialized = false;

  async initialize() {
    this.initialized = true;
  }

  update(view) {
    this.views.push({ ...view, upcoming: [...view.upcoming] });
  }

  updateIdle(notice = null) {
    this.views.push({ idle: true, notice });
  }

  async flush() {}
}

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

function metadata(index = 1) {
  const item = track(index);
  const { requestedById: _id, requestedByName: _name, ...resolved } = item;
  return resolved;
}

function managedResource(item, onDispose = () => undefined) {
  let disposed = false;
  return {
    resource: { metadata: item },
    qualityMode: "opus-passthrough",
    dispose() {
      if (disposed) return;
      disposed = true;
      onDispose();
    },
  };
}

function createSession({
  createAudioResource = async (item) => managedResource(item),
  idleDisconnectMs = 1_000,
  emptyChannelDisconnectMs = 1_000,
  onPlaybackSucceeded,
  onPlaybackFailure,
  onVoiceConnectionFailure,
} = {}) {
  const panel = new FakePanel();
  const player = new FakePlayer();
  const connection = new FakeConnection();
  const destroyedNotices = [];
  const session = new GuildMusicSession(
    "guild-id",
    "voice-a",
    connection,
    panel,
    (_session, notice) => destroyedNotices.push(notice),
    player,
    {
      createAudioResource,
      idleDisconnectMs,
      emptyChannelDisconnectMs,
      onPlaybackSucceeded,
      onPlaybackFailure,
      onVoiceConnectionFailure,
    },
  );
  return { session, panel, player, connection, destroyedNotices };
}

async function waitFor(predicate, message, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createGuildAndChannels(userIds = ["user-1", "user-2", "user-3"]) {
  const guild = {
    id: "guild-id",
    voiceStates: { cache: new Map() },
    channels: { cache: new Map() },
  };
  const makeChannel = (id, members) => {
    const channel = {
      id,
      guild,
      members: new Collection(
        members.map((userId) => [
          userId,
          { user: { id: userId, bot: false }, displayName: userId },
        ]),
      ),
      isVoiceBased: () => true,
    };
    guild.channels.cache.set(id, channel);
    for (const userId of members) {
      guild.voiceStates.cache.set(userId, { channelId: id });
    }
    return channel;
  };
  return {
    guild,
    voiceA: makeChannel("voice-a", userIds),
    voiceB: makeChannel("voice-b", ["user-b"]),
  };
}

function enqueueRequest(guild, voiceChannel, userId, query) {
  return {
    guild,
    voiceChannel,
    query,
    requestedBy: { id: userId },
    requestedByName: userId,
  };
}

test("연속 enqueue의 첫 대기곡 번호는 1이고 재생 종료 후 다음 곡으로 전환한다", async () => {
  const { session, player } = createSession();

  const first = session.enqueue(track(1));
  const second = session.enqueue(track(2));

  assert.equal(first.startedImmediately, true);
  assert.equal(first.queuePosition, 0);
  assert.equal(second.startedImmediately, false);
  assert.equal(second.queuePosition, 1);

  await waitFor(
    () => player.played.length === 1,
    "첫 트랙이 재생되지 않았습니다.",
  );
  assert.equal(session.snapshot().current?.videoId, "video-1");
  assert.equal(session.snapshot().upcoming[0]?.videoId, "video-2");

  player.finish();
  await waitFor(
    () => player.played.length === 2,
    "다음 트랙으로 전환되지 않았습니다.",
  );
  assert.equal(session.snapshot().current?.videoId, "video-2");
  session.disconnect();
});

test("현재 곡 반복은 정상 종료만 반복하고 건너뛰기는 다음 곡으로 진행한다", async () => {
  const { session, player } = createSession();
  session.enqueue(track(1));
  session.enqueue(track(2));
  session.setRepeatMode(MusicRepeatMode.track);
  await waitFor(() => player.played.length === 1, "첫 트랙이 재생되지 않았습니다.");

  player.finish();
  await waitFor(() => player.played.length === 2, "현재 곡이 반복되지 않았습니다.");
  assert.equal(session.snapshot().current?.videoId, "video-1");
  assert.equal(session.snapshot().upcoming[0]?.videoId, "video-2");

  assert.equal(session.skip()?.videoId, "video-1");
  await waitFor(() => player.played.length === 3, "건너뛴 뒤 다음 곡이 재생되지 않았습니다.");
  assert.equal(session.snapshot().current?.videoId, "video-2");
  assert.equal(session.snapshot().repeatMode, MusicRepeatMode.track);
  session.disconnect();
});

test("대기열 전체 반복은 완료한 곡을 끝으로 보내 순서를 순환한다", async () => {
  const { session, player } = createSession();
  session.enqueueMany([track(1), track(2)]);
  session.setRepeatMode(MusicRepeatMode.queue);
  await waitFor(() => player.played.length === 1, "첫 트랙이 재생되지 않았습니다.");

  player.finish();
  await waitFor(() => player.played.length === 2, "둘째 트랙으로 전환되지 않았습니다.");
  assert.equal(session.snapshot().current?.videoId, "video-2");
  assert.equal(session.snapshot().upcoming[0]?.videoId, "video-1");

  player.finish();
  await waitFor(() => player.played.length === 3, "대기열 처음으로 순환하지 않았습니다.");
  assert.equal(session.snapshot().current?.videoId, "video-1");
  assert.equal(session.snapshot().upcoming[0]?.videoId, "video-2");
  session.disconnect();
});

test("재생 오류가 난 곡은 반복 대기열에 다시 넣지 않는다", async () => {
  const { session, player } = createSession();
  session.enqueueMany([track(1), track(2)]);
  session.setRepeatMode(MusicRepeatMode.queue);
  await waitFor(() => player.played.length === 1, "첫 트랙이 재생되지 않았습니다.");

  player.emit("error", new Error("stream failed"));
  await waitFor(() => player.played.length === 2, "오류 뒤 다음 곡으로 넘어가지 않았습니다.");
  assert.equal(session.snapshot().current?.videoId, "video-2");
  assert.equal(session.snapshot().upcoming.length, 0);
  session.disconnect();
});

test("세션은 실제 재생 실패와 외부 음성 연결 종료를 운영 이벤트로 보고한다", async () => {
  const playbackFailures = [];
  const voiceFailures = [];
  const { session, connection } = createSession({
    createAudioResource: async () => {
      throw new Error("stream preparation failed");
    },
    onPlaybackFailure: (event) => playbackFailures.push(event),
    onVoiceConnectionFailure: (event) => voiceFailures.push(event),
  });

  session.enqueue(track(1));
  await waitFor(
    () => playbackFailures.length === 1,
    "재생 준비 실패가 보고되지 않았습니다.",
  );
  assert.equal(playbackFailures[0].stage, "prepare");
  assert.equal(playbackFailures[0].track.videoId, "video-1");

  connection.destroy();
  assert.equal(voiceFailures.length, 1);
  assert.match(voiceFailures[0].reason, /외부/);
});

test("재생 성공은 시작 직후가 아니라 곡이 정상 종료된 뒤 보고한다", async () => {
  const successes = [];
  const { session, player } = createSession({
    onPlaybackSucceeded: (event) => successes.push(event),
  });
  session.enqueue(track(1));
  await waitFor(() => player.played.length === 1, "재생이 시작되지 않았습니다.");
  assert.equal(successes.length, 0);

  player.finish();
  await waitFor(() => successes.length === 1, "정상 종료가 보고되지 않았습니다.");
  assert.equal(successes[0].track.videoId, "video-1");
  session.disconnect();
});

test("5분 내 연속 재생 실패 3회부터 운영자 알림을 보낸다", async () => {
  const alerts = [];
  let resourceAttempts = 0;
  let metadataIndex = 0;
  const panel = new FakePanel();
  const service = new MusicService({}, "guild-id", "music-channel-id", {
    panel,
    operatorAlerts: {
      async notify(event) {
        alerts.push(event);
        return { suppressed: false, dm: "sent", channel: "disabled" };
      },
    },
    resolveTrack: async () => metadata(++metadataIndex),
    inspectRuntime: async () => ({
      ytDlpVersion: "test",
      ffmpegVersion: "test",
    }),
    connectSession: async (channel, sessionPanel, onDestroyed, events) =>
      new GuildMusicSession(
        channel.guild.id,
        channel.id,
        new FakeConnection(),
        sessionPanel,
        onDestroyed,
        new FakePlayer(),
        {
          ...events,
          createAudioResource: async () => {
            resourceAttempts += 1;
            throw new Error(
              "https://media.example.test/audio?token=secret playback failed",
            );
          },
          idleDisconnectMs: 10_000,
          emptyChannelDisconnectMs: 10_000,
        },
      ),
  });
  await service.initialize();
  const { guild, voiceA } = createGuildAndChannels(["user-1"]);

  for (let index = 1; index <= 3; index += 1) {
    await service.resolveAndEnqueue(
      enqueueRequest(guild, voiceA, "user-1", `실패 곡 ${index}`),
    );
    await waitFor(
      () => resourceAttempts === index && service.getSnapshot(guild.id)?.current === null,
      `${index}번째 재생 실패가 처리되지 않았습니다.`,
    );
  }

  await waitFor(() => alerts.length === 1, "연속 재생 실패 알림이 전송되지 않았습니다.");
  assert.equal(alerts[0].key, "music-playback-consecutive-guild-id");
  assert.match(alerts[0].description, /3회 연속/);
  assert.equal(alerts[0].context.영상ID, "video-3");
  await service.destroyAll();
});

test("음악 런타임 초기화 실패는 음악 기능을 막고 운영자에게 알린다", async () => {
  const alerts = [];
  const service = new MusicService({}, "guild-id", "music-channel-id", {
    panel: new FakePanel(),
    operatorAlerts: {
      async notify(event) {
        alerts.push(event);
        return { suppressed: false, dm: "sent", channel: "disabled" };
      },
    },
    inspectRuntime: async () => {
      throw new Error("yt-dlp runtime missing");
    },
  });

  await assert.rejects(() => service.initialize(), /runtime missing/);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, "music-runtime-initialize");
  assert.match(alerts[0].title, /런타임 준비 실패/);
});

test("준비 중 skip은 AbortSignal을 전달하고 다음 곡을 재생한다", async () => {
  let preparingSignal;
  const createAudioResource = (item, options) => {
    if (item.videoId !== "video-1") {
      return Promise.resolve(managedResource(item));
    }
    preparingSignal = options?.signal;
    return new Promise((_resolve, reject) => {
      const rejectAborted = () =>
        reject(
          preparingSignal?.reason instanceof Error
            ? preparingSignal.reason
            : new MusicOperationAbortedError(),
        );
      preparingSignal?.addEventListener("abort", rejectAborted, { once: true });
      if (preparingSignal?.aborted) rejectAborted();
    });
  };
  const { session, player } = createSession({ createAudioResource });
  session.enqueue(track(1));
  session.enqueue(track(2));
  await waitFor(() => Boolean(preparingSignal), "첫 트랙 준비가 시작되지 않았습니다.");

  assert.equal(session.skip()?.videoId, "video-1");
  assert.equal(preparingSignal.aborted, true);
  await waitFor(
    () => player.played.length === 1,
    "skip 뒤 다음 트랙이 재생되지 않았습니다.",
  );
  assert.equal(session.snapshot().current?.videoId, "video-2");
  session.disconnect();
});

test("초기화는 현재 곡·대기열·반복 설정을 정리하고 유휴 시 연결을 종료한다", async () => {
  let disposeCount = 0;
  const { session, player, connection, destroyedNotices } = createSession({
    createAudioResource: async (item) =>
      managedResource(item, () => {
        disposeCount += 1;
      }),
    idleDisconnectMs: 25,
  });
  session.enqueue(track(1));
  session.enqueue(track(2));
  session.setRepeatMode(MusicRepeatMode.queue);
  await waitFor(() => player.played.length === 1, "재생이 시작되지 않았습니다.");

  assert.equal(session.reset(), 2);
  assert.equal(session.snapshot().current, null);
  assert.equal(session.snapshot().upcoming.length, 0);
  assert.equal(session.snapshot().repeatMode, MusicRepeatMode.off);
  assert.equal(disposeCount, 1);
  await waitFor(
    () => connection.state.status === VoiceConnectionStatus.Destroyed,
    "유휴 연결이 자동 종료되지 않았습니다.",
  );
  assert.equal(destroyedNotices.length, 1);
});

test("빈 음성 채널과 외부 연결 파괴는 세션 자원을 한 번만 정리한다", async (t) => {
  await t.test("빈 채널 자동 퇴장", async () => {
    const { session, connection, destroyedNotices } = createSession({
      emptyChannelDisconnectMs: 25,
    });
    const guild = {
      channels: { cache: new Map() },
    };
    const channel = {
      id: "voice-a",
      guild,
      members: new Collection([
        ["bot-user", { user: { id: "bot-user", bot: true } }],
      ]),
      isVoiceBased: () => true,
    };
    guild.channels.cache.set(channel.id, channel);

    session.handleVoiceMembershipChanged(channel);
    await waitFor(
      () => connection.state.status === VoiceConnectionStatus.Destroyed,
      "빈 채널 연결이 자동 종료되지 않았습니다.",
    );
    assert.equal(destroyedNotices.length, 1);
  });

  await t.test("외부 연결 파괴", async () => {
    let disposeCount = 0;
    const { session, player, connection, destroyedNotices } = createSession({
      createAudioResource: async (item) =>
        managedResource(item, () => {
          disposeCount += 1;
        }),
    });
    session.enqueue(track(1));
    session.enqueue(track(2));
    await waitFor(() => player.played.length === 1, "재생이 시작되지 않았습니다.");

    connection.destroy();
    assert.equal(disposeCount, 1);
    assert.equal(destroyedNotices.length, 1);
    assert.equal(session.snapshot().current, null);
    assert.equal(session.snapshot().upcoming.length, 0);
    assert.equal(player.played.length, 1);
  });
});

test("MusicService는 길드별 동시 해석과 음성 채널 선점을 제한한다", async () => {
  const resolverCalls = [];
  const pendingResolvers = [];
  const resolveTrack = (query, options) => {
    resolverCalls.push({ query, signal: options?.signal });
    return new Promise((resolve, reject) => {
      const handleAbort = () => reject(options.signal.reason);
      options?.signal?.addEventListener("abort", handleAbort, { once: true });
      pendingResolvers.push({ resolve, reject });
    });
  };
  const panel = new FakePanel();
  const createdSessions = [];
  const service = new MusicService({}, "guild-id", "music-channel-id", {
    panel,
    resolveTrack,
    inspectRuntime: async () => ({
      ytDlpVersion: "test",
      ffmpegVersion: "test",
    }),
    connectSession: async (channel, sessionPanel, onDestroyed) => {
      const player = new FakePlayer();
      const connection = new FakeConnection();
      const session = new GuildMusicSession(
        channel.guild.id,
        channel.id,
        connection,
        sessionPanel,
        onDestroyed,
        player,
        {
          createAudioResource: async (item) => managedResource(item),
          idleDisconnectMs: 1_000,
          emptyChannelDisconnectMs: 1_000,
        },
      );
      createdSessions.push(session);
      return session;
    },
    maxConcurrentResolutionsPerGuild: 2,
  });
  await service.initialize();
  const { guild, voiceA, voiceB } = createGuildAndChannels();

  const first = service.resolveAndEnqueue(
    enqueueRequest(guild, voiceA, "user-1", "첫 곡"),
  );
  const second = service.resolveAndEnqueue(
    enqueueRequest(guild, voiceA, "user-2", "둘째 곡"),
  );
  await assert.rejects(
    service.resolveAndEnqueue(
      enqueueRequest(guild, voiceA, "user-3", "셋째 곡"),
    ),
    (error) =>
      error instanceof MusicUserError && /여러 개 처리 중/.test(error.message),
  );
  await assert.rejects(
    service.resolveAndEnqueue(
      enqueueRequest(guild, voiceB, "user-b", "다른 채널 곡"),
    ),
    (error) =>
      error instanceof MusicUserError && /같은 음성 채널/.test(error.message),
  );
  assert.equal(resolverCalls.length, 2);

  pendingResolvers[0].resolve(metadata(1));
  pendingResolvers[1].resolve(metadata(2));
  const results = await Promise.all([first, second]);
  assert.equal(results.filter((result) => result.startedImmediately).length, 1);
  assert.equal(results.find((result) => !result.startedImmediately)?.queuePosition, 1);
  assert.equal(createdSessions.length, 1);

  const afterRelease = service.resolveAndEnqueue(
    enqueueRequest(guild, voiceA, "user-3", "슬롯 해제 뒤 곡"),
  );
  assert.equal(resolverCalls.length, 3);
  pendingResolvers[2].resolve(metadata(3));
  assert.equal((await afterRelease).queuePosition, 2);
  await service.destroyAll();
});

test("재생목록은 남은 대기열 자리까지만 원래 순서로 일괄 추가한다", async () => {
  let resolvedTrackIndex = 0;
  const panel = new FakePanel();
  const service = new MusicService({}, "guild-id", "music-channel-id", {
    panel,
    resolveTrack: async () => metadata(++resolvedTrackIndex),
    resolvePlaylist: async (query) =>
      query.includes("large")
        ? {
            title: "대형 재생목록",
            tracks: Array.from({ length: 60 }, (_, index) => metadata(101 + index)),
            sourceTrackCount: 60,
            truncated: false,
          }
        : {
            title: "테스트 재생목록",
            tracks: [metadata(201), metadata(202), metadata(203)],
            sourceTrackCount: 3,
            truncated: false,
          },
    inspectRuntime: async () => ({
      ytDlpVersion: "test",
      ffmpegVersion: "test",
    }),
    connectSession: async (channel, sessionPanel, onDestroyed) =>
      new GuildMusicSession(
        channel.guild.id,
        channel.id,
        new FakeConnection(),
        sessionPanel,
        onDestroyed,
        new FakePlayer(),
        {
          createAudioResource: async (item) => managedResource(item),
          idleDisconnectMs: 1_000,
          emptyChannelDisconnectMs: 1_000,
        },
      ),
  });
  await service.initialize();
  const { guild, voiceA } = createGuildAndChannels(["user-1"]);

  const largeResult = await service.resolveAndEnqueuePlaylist(
    enqueueRequest(guild, voiceA, "user-1", "https://youtube.com/playlist?list=large"),
  );
  assert.equal(largeResult.addedCount, 50);
  assert.equal(largeResult.omittedCount, 10);
  assert.equal(largeResult.truncated, true);

  for (let index = 0; index < 49; index += 1) {
    await service.resolveAndEnqueue(
      enqueueRequest(guild, voiceA, "user-1", `단일 곡 ${index + 1}`),
    );
  }

  const result = await service.resolveAndEnqueuePlaylist(
    enqueueRequest(guild, voiceA, "user-1", "https://youtube.com/playlist?list=test"),
  );
  assert.deepEqual(result, {
    playlistTitle: "테스트 재생목록",
    addedCount: 1,
    omittedCount: 2,
    truncated: false,
    startedImmediately: false,
    firstQueuePosition: 99,
  });
  const snapshot = service.getSnapshot(guild.id);
  assert.equal((snapshot.current ? 1 : 0) + snapshot.upcoming.length, 100);
  assert.equal(snapshot.upcoming.at(-1)?.videoId, "video-201");
  await service.destroyAll();
});

test("세션 연결 전 초기화도 해석 중 요청을 취소한다", async () => {
  let pendingSignal;
  const service = new MusicService({}, "guild-id", "music-channel-id", {
    panel: new FakePanel(),
    resolveTrack: (_query, options) => {
      pendingSignal = options.signal;
      return new Promise((_resolve, reject) => {
        const handleAbort = () => reject(options.signal.reason);
        options.signal.addEventListener("abort", handleAbort, { once: true });
      });
    },
    inspectRuntime: async () => ({
      ytDlpVersion: "test",
      ffmpegVersion: "test",
    }),
  });
  await service.initialize();
  const { guild, voiceA } = createGuildAndChannels(["user-1"]);
  const pending = service.resolveAndEnqueue(
    enqueueRequest(guild, voiceA, "user-1", "해석 중인 곡"),
  );
  await waitFor(() => Boolean(pendingSignal), "해석 요청이 시작되지 않았습니다.");

  assert.deepEqual(await service.reset(guild.id, voiceA.id), {
    removedTracks: 0,
    cancelledRequests: 1,
  });
  assert.equal(pendingSignal.aborted, true);
  await assert.rejects(
    pending,
    (error) =>
      error instanceof MusicUserError && /취소되었습니다/.test(error.message),
  );
  await service.destroyAll();
});

test("예약 슬롯은 해석 완료 전에도 100곡 대기열 상한을 지킨다", async () => {
  let resolvedTrackIndex = 0;
  const panel = new FakePanel();
  const service = new MusicService({}, "guild-id", "music-channel-id", {
    panel,
    resolveTrack: (query, options) => {
      if (query !== "마지막 자리") {
        resolvedTrackIndex += 1;
        return Promise.resolve(metadata(resolvedTrackIndex));
      }
      return new Promise((_resolve, reject) => {
        const handleAbort = () => reject(options.signal.reason);
        options?.signal?.addEventListener("abort", handleAbort, { once: true });
      });
    },
    inspectRuntime: async () => ({
      ytDlpVersion: "test",
      ffmpegVersion: "test",
    }),
    connectSession: async (channel, sessionPanel, onDestroyed) =>
      new GuildMusicSession(
        channel.guild.id,
        channel.id,
        new FakeConnection(),
        sessionPanel,
        onDestroyed,
        new FakePlayer(),
        {
          createAudioResource: async (item) => managedResource(item),
          idleDisconnectMs: 1_000,
          emptyChannelDisconnectMs: 1_000,
        },
      ),
  });
  await service.initialize();
  const { guild, voiceA } = createGuildAndChannels(["user-1", "user-2"]);
  for (let index = 1; index <= 99; index += 1) {
    await service.resolveAndEnqueue(
      enqueueRequest(guild, voiceA, "user-1", `대기열 곡 ${index}`),
    );
  }

  const reserved = service.resolveAndEnqueue(
    enqueueRequest(guild, voiceA, "user-1", "마지막 자리"),
  );
  await assert.rejects(
    service.resolveAndEnqueue(
      enqueueRequest(guild, voiceA, "user-2", "초과 요청"),
    ),
    (error) =>
      error instanceof MusicUserError && /최대 100곡/.test(error.message),
  );
  assert.deepEqual(await service.reset(guild.id, voiceA.id), {
    removedTracks: 99,
    cancelledRequests: 1,
  });
  await assert.rejects(
    reserved,
    (error) =>
      error instanceof MusicUserError && /취소되었습니다/.test(error.message),
  );
  await service.destroyAll();
});
