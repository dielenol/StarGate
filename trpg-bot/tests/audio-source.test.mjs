import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  createAudioResourceFromMedia,
  createChunkedMediaStream,
} from "../dist/music/audio-source.js";
import {
  MusicOperationAbortedError,
  isMusicOperationAbortedError,
} from "../dist/music/types.js";
import {
  isYoutubeMediaForbiddenError,
  YoutubeSourceError,
} from "../dist/music/youtube-source.js";

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

function requestedRange(options) {
  const value = options.headers.Range;
  const match = /^bytes=(\d+)-(\d+)$/.exec(value);
  assert.ok(match, `올바르지 않은 Range 헤더: ${value}`);
  return { start: Number(match[1]), end: Number(match[2]), value };
}

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("직접 미디어를 작은 연속 Range 요청으로 빠짐없이 읽는다", async () => {
  const source = Buffer.from("abcdefghijklmnopqrst");
  const ranges = [];
  const stream = createChunkedMediaStream("https://media.example/audio.webm", {}, {
    chunkSizeBytes: 8,
    fetchMedia: async (_url, options) => {
      const range = requestedRange(options);
      ranges.push(range.value);
      const end = Math.min(range.end, source.length - 1);
      const body = source.subarray(range.start, end + 1);
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Length": String(body.length),
          "Content-Range": `bytes ${range.start}-${end}/${source.length}`,
        },
      });
    },
  });

  assert.equal(stream.readableObjectMode, false);
  assert.deepEqual(await readAll(stream), source);
  assert.deepEqual(ranges, ["bytes=0-7", "bytes=8-15", "bytes=16-19"]);
});

test("실제 HTTP 서버에서도 연속 Range 응답을 하나의 바이트 스트림으로 합친다", async () => {
  const source = Buffer.from("actual-http-range-stream");
  const ranges = [];
  await withHttpServer((request, response) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    assert.ok(match, `올바르지 않은 Range 헤더: ${request.headers.range}`);
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), source.length - 1);
    ranges.push(request.headers.range);
    const body = source.subarray(start, end + 1);
    response.writeHead(206, {
      "Content-Length": body.length,
      "Content-Range": `bytes ${start}-${end}/${source.length}`,
      "Content-Type": "audio/webm",
    });
    response.end(body);
  }, async (url) => {
    const stream = createChunkedMediaStream(url, {}, { chunkSizeBytes: 8 });
    assert.deepEqual(await readAll(stream), source);
  });
  assert.deepEqual(ranges, ["bytes=0-7", "bytes=8-15", "bytes=16-23"]);
});

test("Range 끝을 모두 받으면 서버의 EOF를 기다리지 않고 스트림을 종료한다", async () => {
  const source = Buffer.from("abcdefgh");
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(source);
    },
    cancel() {
      cancelled = true;
    },
  });
  const stream = createChunkedMediaStream("https://media.example/audio.webm", {}, {
    chunkSizeBytes: source.length,
    readTimeoutMs: 10_000,
    fetchMedia: async () => new Response(body, {
      status: 206,
      headers: {
        "Content-Range": `bytes 0-${source.length - 1}/${source.length}`,
      },
    }),
  });
  let timeout;
  try {
    const received = await Promise.race([
      readAll(stream),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Range 끝에서 EOF를 기다렸습니다.")),
          1_000,
        );
      }),
    ]);
    assert.deepEqual(received, source);
    assert.equal(cancelled, true);
  } finally {
    clearTimeout(timeout);
    stream.destroy();
  }
});

test("서버가 요청 범위를 넘는 Content-Range를 보내면 거부한다", async () => {
  let requests = 0;
  const stream = createChunkedMediaStream("https://media.example/audio.webm", {}, {
    chunkSizeBytes: 8,
    fetchMedia: async () => {
      requests += 1;
      return new Response(Buffer.alloc(12), {
        status: 206,
        headers: { "Content-Range": "bytes 0-11/12" },
      });
    },
  });

  await assert.rejects(readAll(stream), /올바르지 않은 Range 응답/);
  assert.equal(requests, 3);
});

test("Range 응답이 정상 EOF로 일찍 끝나도 마지막 바이트부터 이어받는다", async () => {
  const source = Buffer.from("abcdefghijkl");
  const ranges = [];
  let first = true;
  const stream = createChunkedMediaStream("https://media.example/audio.webm", {}, {
    chunkSizeBytes: 8,
    fetchMedia: async (_url, options) => {
      const range = requestedRange(options);
      ranges.push(range.value);
      if (first) {
        first = false;
        return new Response(source.subarray(0, 4), {
          status: 206,
          headers: {
            "Content-Length": "8",
            "Content-Range": `bytes 0-7/${source.length}`,
          },
        });
      }
      const end = Math.min(range.end, source.length - 1);
      const body = source.subarray(range.start, end + 1);
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Length": String(body.length),
          "Content-Range": `bytes ${range.start}-${end}/${source.length}`,
        },
      });
    },
  });

  assert.deepEqual(await readAll(stream), source);
  assert.deepEqual(ranges, ["bytes=0-7", "bytes=4-11"]);
});

test("Range 응답이 오류로 끊겨도 받은 바이트를 중복하지 않고 이어받는다", async () => {
  const source = Buffer.from("abcdefghijkl");
  const ranges = [];
  let first = true;
  const stream = createChunkedMediaStream("https://media.example/audio.webm", {}, {
    chunkSizeBytes: 8,
    fetchMedia: async (_url, options) => {
      const range = requestedRange(options);
      ranges.push(range.value);
      if (first) {
        first = false;
        let delivered = false;
        const body = new ReadableStream({
          async pull(controller) {
            if (!delivered) {
              delivered = true;
              controller.enqueue(source.subarray(0, 4));
              return;
            }
            await new Promise((resolve) => setImmediate(resolve));
            controller.error(new TypeError("terminated"));
          },
        });
        return new Response(body, {
          status: 206,
          headers: {
            "Content-Range": `bytes 0-7/${source.length}`,
          },
        });
      }
      const end = Math.min(range.end, source.length - 1);
      const body = source.subarray(range.start, end + 1);
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Length": String(body.length),
          "Content-Range": `bytes ${range.start}-${end}/${source.length}`,
        },
      });
    },
  });

  assert.deepEqual(await readAll(stream), source);
  assert.deepEqual(ranges, ["bytes=0-7", "bytes=4-11"]);
});

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

test("googlevideo 403 응답은 프로필 교체가 가능한 전용 오류로 분류한다", async () => {
  await withHttpServer((_request, response) => {
    response.writeHead(403, { "Content-Type": "text/plain" });
    response.end("Forbidden");
  }, async (url) => {
    await assert.rejects(
      createAudioResourceFromMedia(TEST_TRACK, passthroughMedia(url), {
        responseTimeoutMs: 1_000,
        firstByteTimeoutMs: 1_000,
      }),
      (error) => {
        assert.equal(isYoutubeMediaForbiddenError(error), true);
        assert.match(error.message, /HTTP 403/);
        return true;
      },
    );
  });
});

test("403이 아닌 HTTP 오류는 일반 소스 오류로 남긴다", async () => {
  await withHttpServer((_request, response) => {
    response.writeHead(500, { "Content-Type": "text/plain" });
    response.end("boom");
  }, async (url) => {
    await assert.rejects(
      createAudioResourceFromMedia(TEST_TRACK, passthroughMedia(url), {
        responseTimeoutMs: 1_000,
        firstByteTimeoutMs: 1_000,
      }),
      (error) => {
        assert.equal(error instanceof YoutubeSourceError, true);
        assert.equal(isYoutubeMediaForbiddenError(error), false);
        return true;
      },
    );
  });
});
