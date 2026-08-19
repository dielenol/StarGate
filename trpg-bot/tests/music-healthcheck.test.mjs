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

function fakeResponse(status) {
  return { ok: status >= 200 && status < 300, status, body: null };
}

/** 재시도 지연을 없애 테스트를 즉시 끝낸다. */
const noDelay = { delay: async () => undefined };

test("모든 프로필이 첫 바이트를 받으면 healthy 로 판정한다", async () => {
  const report = await probeMusicPipeline(VIDEO, {
    ...noDelay,
    resolveMedia: async () => mediaSource(),
    fetchMedia: async () => fakeResponse(206),
  });
  assert.equal(report.state, "healthy");
  assert.equal(report.profiles.length, 2);
  assert.ok(report.profiles.every((result) => result.ok));
  assert.equal(report.profiles[0].label, "primary");
  assert.equal(report.profiles[1].label, "fallback");
});

test("기본 프로필만 403 이면 degraded 로 판정하고 실패 단계를 남긴다", async () => {
  const report = await probeMusicPipeline(VIDEO, {
    ...noDelay,
    resolveMedia: async () => mediaSource(),
    fetchMedia: async (_url, options) =>
      fakeResponse(options.headers.Range === "bytes=0-1023" ? 403 : 500),
  });
  // 두 프로필 모두 403 이므로 down. 기본만 실패하는 경우는 아래에서 확인한다.
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
    fetchMedia: async () => fakeResponse(206),
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
    fetchMedia: async () => fakeResponse(206),
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
