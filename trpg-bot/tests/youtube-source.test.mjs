import test from "node:test";
import assert from "node:assert/strict";

import {
  buildYtDlpInfoArgs,
  getPlayerClients,
  isWebmOpusFormat,
  MEDIA_RESOLVE_PROFILE_COUNT,
  mediaResolveProfile,
  normalizeYoutubePlaylistRequest,
  normalizeYoutubeRequest,
  parseYoutubeMediaSource,
  parseYoutubePlaylistMetadata,
  parseYoutubeTrackMetadata,
  resolveYoutubeTrack,
  YoutubeSourceError,
} from "../dist/music/youtube-source.js";
import {
  MusicOperationAbortedError,
  isMusicOperationAbortedError,
} from "../dist/music/types.js";

test("검색어는 ytsearch1 한 건 검색으로 제한한다", () => {
  assert.equal(normalizeYoutubeRequest("  test song  "), "ytsearch1:test song");
});

test("YouTube URL과 서브도메인을 허용한다", () => {
  assert.equal(
    normalizeYoutubeRequest("https://music.youtube.com/watch?v=abc123"),
    "https://music.youtube.com/watch?v=abc123",
  );
  assert.equal(
    normalizeYoutubeRequest("www.youtube.com/watch?v=abc123"),
    "https://www.youtube.com/watch?v=abc123",
  );
  assert.equal(
    normalizeYoutubeRequest("http://youtu.be/abc123"),
    "https://youtu.be/abc123",
  );
});

test("외부 URL과 로컬 스킴을 차단한다", () => {
  for (const input of [
    "https://youtube.com.evil.example/watch?v=abc123",
    "https://example.com/audio.webm",
    "file:///etc/passwd",
  ]) {
    assert.throws(
      () => normalizeYoutubeRequest(input),
      (error) => error instanceof YoutubeSourceError,
    );
  }
});

test("재생목록 요청은 YouTube list 식별자가 있는 URL만 허용한다", () => {
  assert.equal(
    normalizeYoutubePlaylistRequest(
      "https://www.youtube.com/watch?v=video123&list=playlist123",
    ),
    "https://www.youtube.com/watch?v=video123&list=playlist123",
  );
  for (const input of [
    "검색어 재생목록",
    "https://www.youtube.com/watch?v=video123",
  ]) {
    assert.throws(
      () => normalizeYoutubePlaylistRequest(input),
      (error) => error instanceof YoutubeSourceError,
    );
  }
});

test("WebM Opus 직접 포맷만 재인코딩 없는 경로로 판정한다", () => {
  assert.equal(
    isWebmOpusFormat({ ext: "webm", acodec: "opus", protocol: "https" }),
    true,
  );
  assert.equal(
    isWebmOpusFormat({ ext: "m4a", acodec: "mp4a.40.2", protocol: "https" }),
    false,
  );
  assert.equal(
    isWebmOpusFormat({
      ext: "webm",
      acodec: "opus",
      protocol: "m3u8_native",
    }),
    false,
  );
});

test("검색 결과 wrapper의 첫 영상과 선택 포맷을 정규화한다", () => {
  const metadata = parseYoutubeTrackMetadata(
    JSON.stringify({
      entries: [
        {
          id: "video123",
          title: "Test Song",
          webpage_url: "https://www.youtube.com/watch?v=video123",
          duration: 125.9,
          thumbnails: [
            { url: "https://img.example/small.jpg" },
            { url: "https://img.example/large.jpg" },
          ],
          requested_downloads: [
            { ext: "webm", acodec: "opus", protocol: "https" },
          ],
        },
      ],
    }),
  );

  assert.deepEqual(metadata, {
    videoId: "video123",
    title: "Test Song",
    url: "https://www.youtube.com/watch?v=video123",
    durationSeconds: 125,
    thumbnailUrl: "https://img.example/large.jpg",
    isLive: false,
    preferredQualityMode: "opus-passthrough",
  });
});

test("flat 재생목록은 순서를 유지하고 비공개 영상을 제외한다", () => {
  const playlist = parseYoutubePlaylistMetadata(
    JSON.stringify({
      title: "테스트 목록",
      playlist_count: 4,
      entries: [
        {
          id: "video-1",
          title: "첫 곡",
          url: "video-1",
          duration: 61.8,
        },
        {
          id: "private-2",
          title: "[Private video]",
          availability: "private",
        },
        {
          id: "video-3",
          title: "셋째 곡",
          webpage_url: "https://www.youtube.com/watch?v=video-3",
          duration: 183,
        },
      ],
    }),
  );

  assert.equal(playlist.title, "테스트 목록");
  assert.equal(playlist.sourceTrackCount, 4);
  assert.equal(playlist.truncated, true);
  assert.deepEqual(
    playlist.tracks.map((track) => [track.videoId, track.title, track.url]),
    [
      ["video-1", "첫 곡", "https://www.youtube.com/watch?v=video-1"],
      ["video-3", "셋째 곡", "https://www.youtube.com/watch?v=video-3"],
    ],
  );
  assert.equal(playlist.tracks[0].durationSeconds, 61);
});

test("직접 미디어 헤더를 정규화하고 비 Opus 포맷은 변환 경로로 둔다", () => {
  const source = parseYoutubeMediaSource(
    JSON.stringify({
      is_live: true,
      requested_downloads: [
        {
          url: "https://media.example/audio.m3u8",
          ext: "mp4",
          acodec: "mp4a.40.2",
          protocol: "m3u8_native",
          http_headers: {
            "User-Agent": "test-agent\r\nInjected: no",
            Empty: "",
          },
        },
      ],
    }),
  );

  assert.deepEqual(source, {
    url: "https://media.example/audio.m3u8",
    headers: { "User-Agent": "test-agentInjected: no" },
    protocol: "m3u8_native",
    isLive: true,
    qualityMode: "opus-transcode",
  });
});

test("yt-dlp가 반환한 비 HTTP 미디어 주소를 거부한다", () => {
  assert.throws(
    () =>
      parseYoutubeMediaSource(
        JSON.stringify({
          url: "file:///etc/passwd",
          ext: "webm",
          acodec: "opus",
          protocol: "file",
        }),
      ),
    (error) => error instanceof YoutubeSourceError,
  );
});

test("이미 취소된 해석 요청은 yt-dlp 실행 전에 종료한다", async () => {
  const controller = new AbortController();
  controller.abort(new MusicOperationAbortedError("해석 취소"));

  await assert.rejects(
    resolveYoutubeTrack("테스트 곡", { signal: controller.signal }),
    (error) =>
      isMusicOperationAbortedError(error) && error.message === "해석 취소",
  );
});

/** 환경변수 재정의를 테스트 사이에 누출시키지 않는다. */
function withEnv(overrides, run) {
  const previous = new Map(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function argValues(args, flag) {
  return args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []));
}

test("기본 프로필은 PO token을 요구하지 않는 player client와 Opus 우선 포맷을 쓴다", () => {
  withEnv({
    YT_DLP_PLAYER_CLIENTS: undefined,
    YT_DLP_POT_PROVIDER_URL: undefined,
  }, () => {
    const args = buildYtDlpInfoArgs("https://www.youtube.com/watch?v=abc123", 0);
    assert.deepEqual(argValues(args, "--extractor-args"), [
      "youtube:player_client=tv,visionos",
    ]);
    assert.deepEqual(argValues(args, "-f"), [
      "bestaudio[ext=webm][acodec^=opus]/bestaudio[acodec^=opus]/bestaudio/best",
    ]);
    assert.deepEqual(argValues(args, "-S"), ["proto:https"]);
    assert.equal(args.at(-1), "https://www.youtube.com/watch?v=abc123");
    assert.equal(args.at(-2), "--");
  });
});

test("폴백 프로필은 다른 player client와 완화된 포맷 조건으로 403을 우회한다", () => {
  withEnv({
    YT_DLP_PLAYER_CLIENTS: undefined,
    YT_DLP_POT_PROVIDER_URL: undefined,
  }, () => {
    const args = buildYtDlpInfoArgs("https://www.youtube.com/watch?v=abc123", 1);
    assert.deepEqual(argValues(args, "--extractor-args"), [
      "youtube:player_client=visionos,tv_downgraded",
    ]);
    assert.deepEqual(argValues(args, "-f"), ["bestaudio/best"]);
    assert.deepEqual(argValues(args, "-S"), []);
    assert.notEqual(
      mediaResolveProfile(0).playerClients,
      mediaResolveProfile(1).playerClients,
    );
  });
});

test("프로필 인덱스는 정의된 범위로 고정한다", () => {
  assert.equal(mediaResolveProfile(-5).label, "primary");
  assert.equal(
    mediaResolveProfile(MEDIA_RESOLVE_PROFILE_COUNT + 3).label,
    "fallback",
  );
});

test("player client 재정의는 형식이 올바를 때만 적용한다", () => {
  withEnv({ YT_DLP_PLAYER_CLIENTS: "web_safari,android_vr" }, () => {
    assert.equal(getPlayerClients(), "web_safari,android_vr");
  });
  withEnv({ YT_DLP_PLAYER_CLIENTS: "tv; rm -rf /" }, () => {
    assert.equal(getPlayerClients(), "tv,visionos");
  });
});

test("POT provider 주소는 설정된 경우에만 extractor 인자로 넘긴다", () => {
  withEnv({
    YT_DLP_PLAYER_CLIENTS: undefined,
    YT_DLP_POT_PROVIDER_URL: "http://pot-provider:4416/",
  }, () => {
    assert.deepEqual(
      argValues(buildYtDlpInfoArgs("ytsearch1:test", 0), "--extractor-args"),
      [
        "youtube:player_client=tv,visionos",
        "youtubepot-bgutilhttp:base_url=http://pot-provider:4416",
      ],
    );
  });
  withEnv({
    YT_DLP_PLAYER_CLIENTS: undefined,
    YT_DLP_POT_PROVIDER_URL: "file:///etc/passwd",
  }, () => {
    assert.deepEqual(
      argValues(buildYtDlpInfoArgs("ytsearch1:test", 0), "--extractor-args"),
      ["youtube:player_client=tv,visionos"],
    );
  });
});
