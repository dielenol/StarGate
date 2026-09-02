import test from "node:test";
import assert from "node:assert/strict";

import {
  probeMusicPipeline,
  startMusicHealthcheck,
} from "../dist/music/music-healthcheck.js";

const VIDEO = "https://www.youtube.com/watch?v=probe";

function mediaSource(url = "https://media.example/audio.webm") {
  return {
    url,
    headers: { "User-Agent": "probe" },
    protocol: "https",
    isLive: false,
    qualityMode: "opus-passthrough",
  };
}

function fakeResponse(status, options, source = Buffer.from("probe audio")) {
  if (status !== 206) return new Response("error", { status });
  const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
  assert.ok(match, `올바르지 않은 Range 헤더: ${options.headers.Range}`);
  const start = Number(match[1]);
  const end = Math.min(Number(match[2]), source.length - 1);
  const body = source.subarray(start, end + 1);
  return new Response(body, {
    status,
    headers: {
      "Content-Length": String(body.length),
      "Content-Range": `bytes ${start}-${end}/${source.length}`,
    },
  });
}

/** 재시도 지연을 없애 테스트를 즉시 끝낸다. */
const noDelay = { delay: async () => undefined };

test("모든 프로필이 미디어의 다중 Range를 끝까지 받으면 healthy 로 판정한다", async () => {
  const source = Buffer.alloc(1024 * 1024 + 1, 1);
  const ranges = [];
  const report = await probeMusicPipeline(VIDEO, {
    ...noDelay,
    resolveMedia: async () => mediaSource(),
    fetchMedia: async (_url, options) => {
      ranges.push(options.headers.Range);
      return fakeResponse(206, options, source);
    },
  });
  assert.equal(report.state, "healthy");
  assert.equal(report.profiles.length, 2);
  assert.ok(report.profiles.every((result) => result.ok));
  assert.equal(report.profiles[0].label, "primary");
  assert.equal(report.profiles[1].label, "fallback");
  assert.deepEqual(ranges, [
    "bytes=0-524287",
    "bytes=524288-1048575",
    "bytes=1048576-1048576",
    "bytes=0-524287",
    "bytes=524288-1048575",
    "bytes=1048576-1048576",
  ]);
});

test("모든 프로필이 403 이면 down과 미디어 수신 단계를 남긴다", async () => {
  const report = await probeMusicPipeline(VIDEO, {
    ...noDelay,
    resolveMedia: async () => mediaSource(),
    fetchMedia: async (_url, options) => fakeResponse(403, options),
  });
  assert.equal(report.state, "down");
  assert.equal(report.profiles[0].failureStage, "fetch");
  assert.equal(report.profiles[0].httpStatus, 403);
});

test("폴백만 살아 있으면 degraded 로 판정한다", async () => {
  const report = await probeMusicPipeline(VIDEO, {
    ...noDelay,
    resolveMedia: async (_url, options) => {
      if (options.profile === 0) throw new Error("primary client 차단");
      return mediaSource();
    },
    fetchMedia: async (_url, options) => fakeResponse(206, options),
  });
  assert.equal(report.state, "degraded");
  assert.equal(report.profiles[0].ok, false);
  assert.equal(report.profiles[0].failureStage, "resolve");
  assert.match(report.profiles[0].detail, /primary client 차단/);
  assert.equal(report.profiles[1].ok, true);
});

test("일시적 실패는 프로필별 재시도로 흡수한다", async () => {
  let calls = 0;
  const report = await probeMusicPipeline(VIDEO, {
    ...noDelay,
    resolveMedia: async () => {
      calls += 1;
      if (calls === 1) throw new Error("일시적 네트워크 오류");
      return mediaSource();
    },
    fetchMedia: async (_url, options) => fakeResponse(206, options),
  });
  assert.equal(report.state, "healthy");
  assert.equal(calls, 3);
});

test("점검이 실패하면 운영 알림을 critical 로 보낸다", async () => {
  const alerts = [];
  const stop = startMusicHealthcheck({
    videoUrl: VIDEO,
    intervalMs: 60_000,
    startDelayMs: 0,
    operatorAlerts: {
      notify: async (event) => {
        alerts.push(event);
        return { suppressed: false, dm: "sent", channel: "sent" };
      },
    },
    ytDlpVersion: "2026.08.18",
    probe: async () => ({
      state: "down",
      videoUrl: VIDEO,
      durationMs: 12,
      profiles: [
        {
          profile: 0,
          label: "primary",
          playerClients: "visionos",
          ok: false,
          qualityMode: null,
          httpStatus: 403,
          failureStage: "fetch",
          detail: "미디어 응답이 HTTP 403 입니다.",
        },
      ],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  stop();

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "critical");
  assert.equal(alerts[0].key, "music-healthcheck");
  assert.equal(alerts[0].context["yt-dlp"], "2026.08.18");
  assert.match(alerts[0].context["프로필0"], /HTTP 403/);
});

test("정상일 때는 알리지 않고, 실패 후 복구되면 한 번만 알린다", async () => {
  const alerts = [];
  const states = ["healthy", "down", "healthy", "healthy"];
  let index = 0;
  const stop = startMusicHealthcheck({
    videoUrl: VIDEO,
    intervalMs: 5,
    startDelayMs: 0,
    operatorAlerts: {
      notify: async (event) => {
        alerts.push(event.key);
        return { suppressed: false, dm: "sent", channel: "sent" };
      },
    },
    probe: async () => ({
      state: states[Math.min(index++, states.length - 1)],
      videoUrl: VIDEO,
      durationMs: 1,
      profiles: [
        {
          profile: 0,
          label: "primary",
          playerClients: "visionos",
          ok: true,
          qualityMode: "opus-passthrough",
          httpStatus: 206,
          failureStage: null,
          detail: null,
        },
      ],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 90));
  stop();

  assert.deepEqual(alerts, ["music-healthcheck", "music-healthcheck-recovered"]);
});

test("중단 이후에는 알림을 보내지 않는다", async () => {
  const alerts = [];
  const stop = startMusicHealthcheck({
    videoUrl: VIDEO,
    intervalMs: 5,
    startDelayMs: 0,
    operatorAlerts: {
      notify: async () => {
        alerts.push("x");
        return { suppressed: false, dm: "sent", channel: "sent" };
      },
    },
    probe: async () => {
      stop();
      return {
        state: "down",
        videoUrl: VIDEO,
        durationMs: 1,
        profiles: [],
      };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  stop();
  assert.equal(alerts.length, 0);
});
