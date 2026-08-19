/**
 * 음악 재생 경로 일일 자동 점검.
 *
 * YouTube 는 예고 없이 player client 를 조이고, 그때 실패는 서버 IP 에서만 재현된다.
 * 그래서 점검은 봇 프로세스 안에서 실제 해석 코드와 같은 경로로 수행하고, 결과가
 * 나빠질 때만 운영자에게 알린다.
 *
 * 프로필별로 나눠 점검한다 — 1순위 client 가 죽었는데 폴백이 가려주는 상태를
 * "정상"으로 넘기면 폴백까지 무너진 날 갑자기 전면 장애가 되기 때문이다.
 */

import { sanitizedHttpHeaders } from "./audio-source.js";
import {
  MEDIA_RESOLVE_PROFILE_COUNT,
  mediaResolveProfile,
  resolveYoutubeMedia,
  type YoutubeMediaSource,
} from "./youtube-source.js";

import type { OperatorAlertSink } from "../utils/operator-alerts.js";

const PROBE_TIMEOUT_MS = 30_000;
const PROBE_RANGE_HEADER = "bytes=0-1023";
/** 일시적인 네트워크 오류로 알림이 뜨지 않게 프로필별로 한 번 더 시도한다. */
const PROBE_ATTEMPTS_PER_PROFILE = 2;
const PROBE_RETRY_DELAY_MS = 3_000;

export type MusicProbeStage = "resolve" | "fetch";

export interface MusicProfileProbeResult {
  profile: number;
  label: string;
  playerClients: string;
  ok: boolean;
  qualityMode: string | null;
  httpStatus: number | null;
  failureStage: MusicProbeStage | null;
  detail: string | null;
}

export type MusicHealthState = "healthy" | "degraded" | "down";

export interface MusicProbeReport {
  state: MusicHealthState;
  videoUrl: string;
  profiles: MusicProfileProbeResult[];
  durationMs: number;
}

export interface MusicProbeDependencies {
  resolveMedia?: (
    videoUrl: string,
    options: { signal?: AbortSignal; profile?: number },
  ) => Promise<YoutubeMediaSource>;
  fetchMedia?: typeof fetch;
  delay?: (ms: number) => Promise<void>;
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** 한 프로필의 해석 + 첫 바이트 수신을 확인한다. */
async function probeProfile(
  videoUrl: string,
  profile: number,
  dependencies: MusicProbeDependencies,
): Promise<MusicProfileProbeResult> {
  const resolveMedia = dependencies.resolveMedia ?? resolveYoutubeMedia;
  const fetchMedia = dependencies.fetchMedia ?? fetch;
  const delay = dependencies.delay ?? defaultDelay;
  const { label, playerClients } = mediaResolveProfile(profile);

  let last: MusicProfileProbeResult = {
    profile,
    label,
    playerClients,
    ok: false,
    qualityMode: null,
    httpStatus: null,
    failureStage: "resolve",
    detail: "점검을 실행하지 못했습니다.",
  };

  for (let attempt = 0; attempt < PROBE_ATTEMPTS_PER_PROFILE; attempt += 1) {
    if (attempt > 0) await delay(PROBE_RETRY_DELAY_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    timer.unref?.();
    try {
      const media = await resolveMedia(videoUrl, {
        signal: controller.signal,
        profile,
      });
      const response = await fetchMedia(media.url, {
        headers: {
          ...sanitizedHttpHeaders(media.headers),
          Range: PROBE_RANGE_HEADER,
        },
        redirect: "follow",
        signal: controller.signal,
      });
      // 스트림을 열어둔 채 두면 소켓이 남으므로 본문은 즉시 버린다.
      await response.body?.cancel();
      if (!response.ok) {
        last = {
          profile,
          label,
          playerClients,
          ok: false,
          qualityMode: media.qualityMode,
          httpStatus: response.status,
          failureStage: "fetch",
          detail: `미디어 응답이 HTTP ${response.status} 입니다.`,
        };
        continue;
      }
      return {
        profile,
        label,
        playerClients,
        ok: true,
        qualityMode: media.qualityMode,
        httpStatus: response.status,
        failureStage: null,
        detail: null,
      };
    } catch (error) {
      last = {
        profile,
        label,
        playerClients,
        ok: false,
        qualityMode: null,
        httpStatus: null,
        failureStage: "resolve",
        detail: errorDetail(error),
      };
    } finally {
      clearTimeout(timer);
      if (!controller.signal.aborted) controller.abort();
    }
  }
  return last;
}

/** 모든 해석 프로필을 점검해 종합 상태를 만든다. */
export async function probeMusicPipeline(
  videoUrl: string,
  dependencies: MusicProbeDependencies = {},
): Promise<MusicProbeReport> {
  const startedAt = Date.now();
  const profiles: MusicProfileProbeResult[] = [];
  for (let profile = 0; profile < MEDIA_RESOLVE_PROFILE_COUNT; profile += 1) {
    profiles.push(await probeProfile(videoUrl, profile, dependencies));
  }
  const primaryOk = profiles[0]?.ok === true;
  const anyOk = profiles.some((result) => result.ok);
  return {
    state: primaryOk ? "healthy" : anyOk ? "degraded" : "down",
    videoUrl,
    profiles,
    durationMs: Date.now() - startedAt,
  };
}

function profileSummary(result: MusicProfileProbeResult): string {
  const head = `${result.label}(${result.playerClients})`;
  if (result.ok) {
    return `${head}: 정상 · ${result.qualityMode ?? "unknown"}`;
  }
  const stage = result.failureStage === "fetch" ? "미디어 수신" : "URL 해석";
  return `${head}: 실패 · ${stage} · ${result.detail ?? "원인 불명"}`;
}

export interface MusicHealthcheckOptions {
  videoUrl: string;
  intervalMs: number;
  startDelayMs: number;
  operatorAlerts: OperatorAlertSink;
  ytDlpVersion?: string;
  probe?: (videoUrl: string) => Promise<MusicProbeReport>;
}

/**
 * 주기적 점검을 시작하고 중단 함수를 돌려준다.
 *
 * 상태가 나쁠 때만 알린다. 나빠진 상태가 이어지면 매 점검마다 알리고(하루 1회 주기라
 * 소음이 되지 않는다), 정상으로 돌아오면 복구 사실을 한 번 알린다.
 */
export function startMusicHealthcheck(
  options: MusicHealthcheckOptions,
): () => void {
  const probe =
    options.probe ?? ((videoUrl: string) => probeMusicPipeline(videoUrl));
  let lastState: MusicHealthState | null = null;
  let stopped = false;

  const notifyFailure = async (report: MusicProbeReport): Promise<void> => {
    const down = report.state === "down";
    await options.operatorAlerts.notify({
      key: "music-healthcheck",
      title: down
        ? "음악 재생 자동 점검 실패"
        : "음악 재생 자동 점검 경고 — 폴백만 동작",
      description: down
        ? "모든 해석 프로필이 실패했습니다. 음악 재생이 동작하지 않습니다. " +
          "README 의 \"YouTube 403 대응\" 절차를 확인해 주세요."
        : "기본 해석 프로필이 실패하고 폴백만 동작합니다. 지금은 재생되지만 " +
          "폴백까지 막히면 전면 장애가 됩니다. player client 설정을 점검해 주세요.",
      severity: down ? "critical" : "warning",
      context: {
        점검영상: report.videoUrl,
        소요: `${report.durationMs}ms`,
        "yt-dlp": options.ytDlpVersion ?? "unknown",
        ...Object.fromEntries(
          report.profiles.map((result) => [
            `프로필${result.profile}`,
            profileSummary(result),
          ]),
        ),
      },
    });
  };

  const notifyRecovery = async (report: MusicProbeReport): Promise<void> => {
    await options.operatorAlerts.notify({
      key: "music-healthcheck-recovered",
      title: "음악 재생 자동 점검 복구",
      description: "기본 해석 프로필이 다시 정상 동작합니다.",
      severity: "warning",
      context: {
        점검영상: report.videoUrl,
        "yt-dlp": options.ytDlpVersion ?? "unknown",
        프로필0: profileSummary(report.profiles[0] ?? {
          profile: 0,
          label: "primary",
          playerClients: "unknown",
          ok: true,
          qualityMode: null,
          httpStatus: null,
          failureStage: null,
          detail: null,
        }),
      },
    });
  };

  const runOnce = async (): Promise<void> => {
    if (stopped) return;
    try {
      const report = await probe(options.videoUrl);
      if (stopped) return;
      console.info(
        `[music] 자동 점검 결과 state=${report.state} ` +
          report.profiles
            .map((result) => `${result.label}=${result.ok ? "ok" : "fail"}`)
            .join(" "),
      );
      const recovered = report.state === "healthy" && lastState !== null &&
        lastState !== "healthy";
      lastState = report.state;
      if (report.state !== "healthy") {
        await notifyFailure(report);
        return;
      }
      if (recovered) await notifyRecovery(report);
    } catch (error) {
      // 점검 자체의 예외가 봇을 흔들면 안 된다.
      console.error("[music] 자동 점검 실행 실패:", error);
    }
  };

  const startTimer = setTimeout(() => {
    void runOnce();
  }, options.startDelayMs);
  startTimer.unref?.();

  const intervalTimer = setInterval(() => {
    void runOnce();
  }, options.intervalMs);
  intervalTimer.unref?.();

  return () => {
    stopped = true;
    clearTimeout(startTimer);
    clearInterval(intervalTimer);
  };
}
