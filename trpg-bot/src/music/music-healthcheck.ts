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

import { recordTaskRun } from "../utils/runtime-status.js";

import { createChunkedMediaStream } from "./audio-source.js";
import { describePotProvider } from "./pot-provider.js";
import { MusicOperationAbortedError } from "./types.js";
import {
  MEDIA_RESOLVE_PROFILE_COUNT,
  mediaResolveProfile,
  resolveYoutubeMedia,
  type YoutubeMediaSource,
} from "./youtube-source.js";

import type { OperatorAlertSink } from "../utils/operator-alerts.js";

const PROBE_TIMEOUT_MS = 45_000;
/** 결과가 나쁘면 복구 여부를 빨리 알 수 있게 기본 주기보다 자주 다시 점검한다 */
const UNHEALTHY_RECHECK_MS = 60 * 60_000;
/** 기본 점검 영상은 끝까지, 긴 영상은 충분한 다중 Range 구간까지만 읽는다. */
const PROBE_MAX_BYTES = 8 * 1024 * 1024;
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

/** 한 프로필의 해석 + 다중 Range 미디어 수신을 확인한다. */
async function probeProfile(
  videoUrl: string,
  profile: number,
  dependencies: MusicProbeDependencies,
  signal?: AbortSignal,
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
    if (signal?.aborted) break;
    if (attempt > 0) await delay(PROBE_RETRY_DELAY_MS);
    const controller = new AbortController();
    // 시간 초과는 "재생 준비가 취소되었습니다" 같은 일반 취소 문구 대신 원인을 남긴다.
    const timer = setTimeout(
      () =>
        controller.abort(
          new MusicOperationAbortedError(
            `점검 시간 ${PROBE_TIMEOUT_MS / 1_000}초 초과`,
          ),
        ),
      PROBE_TIMEOUT_MS,
    );
    timer.unref?.();
    // 점검을 중단(봇 종료)하면 진행 중인 yt-dlp·미디어 요청도 함께 취소한다.
    const abortFromOuter = (): void =>
      controller.abort(new MusicOperationAbortedError("자동 점검이 중단되었습니다."));
    signal?.addEventListener("abort", abortFromOuter, { once: true });
    let media: YoutubeMediaSource;
    try {
      media = await resolveMedia(videoUrl, {
        signal: controller.signal,
        profile,
      });
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
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromOuter);
      if (!controller.signal.aborted) controller.abort();
      continue;
    }

    let httpStatus: number | null = null;
    const stream = createChunkedMediaStream(media.url, media.headers, {
      signal: controller.signal,
      maxBytes: PROBE_MAX_BYTES,
      fetchMedia,
      onResponse: (status) => {
        httpStatus = status;
      },
    });
    try {
      let receivedBytes = 0;
      for await (const chunk of stream) {
        receivedBytes += Buffer.byteLength(chunk);
      }
      if (receivedBytes === 0) {
        throw new Error("미디어 응답에 오디오 데이터가 없습니다.");
      }
      return {
        profile,
        label,
        playerClients,
        ok: true,
        qualityMode: media.qualityMode,
        httpStatus,
        failureStage: null,
        detail: null,
      };
    } catch (error) {
      last = {
        profile,
        label,
        playerClients,
        ok: false,
        qualityMode: media.qualityMode,
        httpStatus,
        failureStage: "fetch",
        detail: errorDetail(error),
      };
    } finally {
      stream.destroy();
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromOuter);
      if (!controller.signal.aborted) controller.abort();
    }
  }
  return last;
}

/** 모든 해석 프로필을 점검해 종합 상태를 만든다. */
export async function probeMusicPipeline(
  videoUrl: string,
  dependencies: MusicProbeDependencies = {},
  signal?: AbortSignal,
): Promise<MusicProbeReport> {
  const startedAt = Date.now();
  const profiles: MusicProfileProbeResult[] = [];
  for (let profile = 0; profile < MEDIA_RESOLVE_PROFILE_COUNT; profile += 1) {
    if (signal?.aborted) break;
    profiles.push(await probeProfile(videoUrl, profile, dependencies, signal));
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
  probe?: (videoUrl: string, signal: AbortSignal) => Promise<MusicProbeReport>;
  /** 결과가 나쁠 때 다음 점검까지의 간격 (기본 1시간, `intervalMs` 보다 길지 않게) */
  unhealthyIntervalMs?: number;
  /** 운영 알림 진단용 POT provider 상태 한 줄 */
  describePotProvider?: () => Promise<string>;
}

/**
 * 주기적 점검을 시작하고 중단 함수를 돌려준다.
 *
 * - 한 번에 하나만 실행하고, 끝난 뒤에 다음 점검을 예약한다(겹침·폭주 방지).
 * - 결과가 나쁘면 1시간 뒤 다시 점검해 복구 여부를 빨리 확인하고, 매 점검마다 알린다.
 * - 정상으로 돌아오면 복구 사실을 한 번 알린다. 재배포 뒤 첫 점검이 정상이면 그
 *   사실도 한 번 알려 "고쳐졌음"과 "점검이 안 돌았음"을 구분할 수 있게 한다.
 */
export function startMusicHealthcheck(
  options: MusicHealthcheckOptions,
): () => void {
  const probe =
    options.probe ??
    ((videoUrl: string, signal: AbortSignal) =>
      probeMusicPipeline(videoUrl, {}, signal));
  const describePot = options.describePotProvider ?? (() => describePotProvider());
  const unhealthyIntervalMs = Math.min(
    options.unhealthyIntervalMs ?? UNHEALTHY_RECHECK_MS,
    options.intervalMs,
  );
  let lastState: MusicHealthState | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const controller = new AbortController();

  const notifyFailure = async (report: MusicProbeReport): Promise<void> => {
    const down = report.state === "down";
    const pot = await describePot().catch(() => "확인 실패");
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
        POT: pot,
        다음점검: `${Math.round(unhealthyIntervalMs / 60_000)}분 뒤`,
        ...Object.fromEntries(
          report.profiles.map((result) => [
            `프로필${result.profile}`,
            profileSummary(result),
          ]),
        ),
      },
    });
  };

  const notifyRecovery = async (
    report: MusicProbeReport,
    reason: "recovered" | "startup",
  ): Promise<void> => {
    await options.operatorAlerts.notify({
      key: `music-healthcheck-${reason}`,
      title:
        reason === "recovered"
          ? "음악 재생 자동 점검 복구"
          : "음악 재생 자동 점검 정상 — 기동 후 첫 점검",
      description:
        reason === "recovered"
          ? "기본 해석 프로필이 다시 정상 동작합니다."
          : "봇 기동 뒤 첫 자동 점검에서 기본 해석 프로필이 정상 동작했습니다.",
      severity: "info",
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

  /** 점검을 한 번 실행하고, 결과에 따라 다음 점검까지의 간격을 돌려준다. */
  const runOnce = async (): Promise<number> => {
    try {
      const report = await probe(options.videoUrl, controller.signal);
      if (stopped) return options.intervalMs;
      console.info(
        `[music] 자동 점검 결과 state=${report.state} ` +
          report.profiles
            .map((result) => `${result.label}=${result.ok ? "ok" : "fail"}`)
            .join(" "),
      );
      recordTaskRun("music-healthcheck", {
        ok: report.state === "healthy",
        detail: report.state,
        error:
          report.state === "healthy"
            ? undefined
            : report.profiles.find((result) => !result.ok)?.detail ?? report.state,
      });
      const previousState = lastState;
      lastState = report.state;
      if (report.state !== "healthy") {
        await notifyFailure(report);
        return unhealthyIntervalMs;
      }
      if (previousState === null) {
        await notifyRecovery(report, "startup");
      } else if (previousState !== "healthy") {
        await notifyRecovery(report, "recovered");
      }
      return options.intervalMs;
    } catch (error) {
      // 점검 자체의 예외가 봇을 흔들면 안 된다.
      console.error("[music] 자동 점검 실행 실패:", error);
      recordTaskRun("music-healthcheck", { ok: false, error });
      return unhealthyIntervalMs;
    }
  };

  const schedule = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      void runOnce().then((nextDelayMs) => schedule(nextDelayMs));
    }, delayMs);
    timer.unref?.();
  };

  schedule(options.startDelayMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    controller.abort(new MusicOperationAbortedError("자동 점검이 중단되었습니다."));
  };
}
