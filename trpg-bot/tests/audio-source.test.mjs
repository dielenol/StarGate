import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createAudioResourceFromMedia } from "../dist/music/audio-source.js";
import {
  MusicOperationAbortedError,
  isMusicOperationAbortedError,
} from "../dist/music/types.js";
import { YoutubeSourceError } from "../dist/music/youtube-source.js";

const TEST_TRACK = {
  videoId: "video-id",
  title: "테스트 곡",
  url: "https://www.youtube.com/watch?v=video-id",
  durationSeconds: 120,
  thumbnailUrl: null,
  isLive: false,
  preferredQualityMode: "opus-passthrough",
  requestedById: "user-id",
  requestedByName: "요청자",
};

async function withHttpServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.notEqual(typeof address, "string");
  try {
    await run(`http://127.0.0.1:${address.port}/audio.webm`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function passthroughMedia(url) {
  return {
    url,
    headers: {},
    protocol: "http",
    isLive: false,
    qualityMode: "opus-passthrough",
  };
}

test("응답 헤더가 없는 HTTP 오디오 요청은 제한 시간 뒤 중단한다", async () => {
  await withHttpServer(() => undefined, async (url) => {
    await assert.rejects(
      createAudioResourceFromMedia(TEST_TRACK, passthroughMedia(url), {
        responseTimeoutMs: 50,
        firstByteTimeoutMs: 1_000,
      }),
      (error) =>
        error instanceof YoutubeSourceError && /응답 시간/.test(error.message),
    );
  });
});

test("헤더 뒤 오디오 데이터가 오지 않으면 첫 바이트 제한 시간으로 중단한다", async () => {
  await withHttpServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "audio/webm" });
    response.flushHeaders();
  }, async (url) => {
    await assert.rejects(
      createAudioResourceFromMedia(TEST_TRACK, passthroughMedia(url), {
        responseTimeoutMs: 1_000,
        firstByteTimeoutMs: 50,
      }),
      (error) =>
        error instanceof YoutubeSourceError && /데이터 응답 시간/.test(error.message),
    );
  });
});

test("상위 세션의 AbortSignal은 응답 대기 중인 HTTP 요청까지 취소한다", async () => {
  await withHttpServer(() => undefined, async (url) => {
    const controller = new AbortController();
    const preparing = createAudioResourceFromMedia(
      TEST_TRACK,
      passthroughMedia(url),
      {
        signal: controller.signal,
        responseTimeoutMs: 1_000,
        firstByteTimeoutMs: 1_000,
      },
    );
    controller.abort(new MusicOperationAbortedError("테스트 취소"));

    await assert.rejects(preparing, (error) => {
      assert.equal(isMusicOperationAbortedError(error), true);
      assert.equal(error.message, "테스트 취소");
      return true;
    });
  });
});
