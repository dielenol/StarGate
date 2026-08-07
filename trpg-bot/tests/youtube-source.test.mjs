import test from "node:test";
import assert from "node:assert/strict";

import {
  isWebmOpusFormat,
  normalizeYoutubeRequest,
  parseYoutubeMediaSource,
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
