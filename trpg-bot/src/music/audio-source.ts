/**
 * YouTube 직접 미디어를 Discord AudioResource로 변환한다.
 *
 * WebM/Opus는 디코딩·재인코딩 없이 demux만 수행하고, 그 외 포맷과 라이브
 * 스트림만 FFmpeg/libopus 48 kHz stereo 128 kbps VBR로 한 번 변환한다.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { createAudioResource, StreamType } from "@discordjs/voice";

import type { AudioResource } from "@discordjs/voice";

import {
  DEFAULT_VOLUME_PERCENT,
  isDefaultVolume,
  isMusicOperationAbortedError,
  MusicOperationAbortedError,
  type AudioQualityMode,
  type MusicTrack,
} from "./types.js";
import {
  getFfmpegExecutable,
  isYoutubeMediaForbiddenError,
  MEDIA_RESOLVE_PROFILE_COUNT,
  resolveYoutubeMedia,
  YoutubeMediaForbiddenError,
  YoutubeSourceError,
  type YoutubeMediaSource,
} from "./youtube-source.js";

const MAX_FFMPEG_ERROR_BYTES = 16 * 1024;
/** 프로필 교체 + 서명 URL 재해석까지 감싸는 준비 시도 횟수 상한. */
const MAX_RESOURCE_ATTEMPTS = 3;
/** FFmpeg가 googlevideo 403을 만났을 때 stderr에 남는 표현. */
const FORBIDDEN_STDERR_PATTERN = /403 forbidden|http error 403|server returned 403/i;
const DEFAULT_RESPONSE_TIMEOUT_MS = 20_000;
const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 20_000;

export interface AudioResourceRequestOptions {
  signal?: AbortSignal;
  responseTimeoutMs?: number;
  firstByteTimeoutMs?: number;
  /** 직접 Opus 전달이 조기 종료됐을 때 FFmpeg 재연결 경로를 강제한다. */
  forceTranscode?: boolean;
  /**
   * 재생 음량(%). 100이면 무손실 Opus 전달을 유지하고, 그 외에는 FFmpeg 음량
   * 필터를 쓰기 위해 변환 경로로 전환한다. Opus 인코더 의존성을 추가하지 않고
   * 음량을 조절하려면 FFmpeg 단계에서 처리하는 방법밖에 없다.
   */
  volumePercent?: number;
  /** 변환 경로에서 이 지점(초)부터 재생한다. 음량 변경 후 이어듣기에 사용한다. */
  seekSeconds?: number;
}

export interface ManagedAudioResource {
  resource: AudioResource<MusicTrack>;
  qualityMode: AudioQualityMode;
  dispose(): void;
}

export function sanitizedHttpHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const blocked = new Set([
    "accept-encoding",
    "connection",
    "content-length",
    "host",
    "transfer-encoding",
  ]);
  return Object.fromEntries(
    Object.entries(headers)
      .filter(
        ([key]) =>
          !blocked.has(key.toLowerCase()) &&
          /^[!#$%&'*+.^_`|~\dA-Za-z-]+$/.test(key),
      )
      .map(([key, value]) => [key, value.replace(/[\r\n]/g, "")]),
  );
}

function timeoutValue(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function abortedOperation(signal: AbortSignal | undefined): MusicOperationAbortedError {
  return signal?.reason instanceof MusicOperationAbortedError
    ? signal.reason
    : new MusicOperationAbortedError();
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortedOperation(signal);
}

function linkAbortSignal(
  signal: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (!signal) return () => undefined;
  const handleAbort = (): void => {
    if (!controller.signal.aborted) controller.abort(abortedOperation(signal));
  };
  signal.addEventListener("abort", handleAbort, { once: true });
  if (signal.aborted) handleAbort();
  return () => signal.removeEventListener("abort", handleAbort);
}

async function waitForFirstByte(
  stream: Readable,
  timeoutMs: number,
  signal: AbortSignal,
  timeoutMessage: string,
  handleTimeout: (error: YoutubeSourceError) => void,
): Promise<void> {
  if (signal.aborted) throw abortedOperation(signal);
  if (stream.readableLength > 0) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      stream.removeListener("readable", handleReadable);
      stream.removeListener("end", handleEnded);
      stream.removeListener("close", handleEnded);
      stream.removeListener("error", handleError);
      signal.removeEventListener("abort", handleAbort);
    };
    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const handleReadable = (): void => settle();
    const handleEnded = (): void =>
      settle(new YoutubeSourceError("YouTube 오디오 데이터가 비어 있습니다."));
    const handleError = (error: Error): void => settle(error);
    const handleAbort = (): void => settle(abortedOperation(signal));
    const timer = setTimeout(() => {
      const error = new YoutubeSourceError(timeoutMessage);
      settle(error);
      handleTimeout(error);
    }, timeoutMs);
    timer.unref();

    stream.once("readable", handleReadable);
    stream.once("end", handleEnded);
    stream.once("close", handleEnded);
    stream.once("error", handleError);
    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) handleAbort();
  });
}

async function createPassthroughResource(
  track: MusicTrack,
  url: string,
  headers: Record<string, string>,
  options: AudioResourceRequestOptions,
): Promise<ManagedAudioResource> {
  throwIfAborted(options.signal);
  const controller = new AbortController();
  const detachAbortSignal = linkAbortSignal(options.signal, controller);
  const responseTimeoutMs = timeoutValue(
    options.responseTimeoutMs,
    DEFAULT_RESPONSE_TIMEOUT_MS,
  );
  const firstByteTimeoutMs = timeoutValue(
    options.firstByteTimeoutMs,
    DEFAULT_FIRST_BYTE_TIMEOUT_MS,
  );
  const responseTimeoutError = new YoutubeSourceError(
    "YouTube 오디오 서버의 응답 시간이 초과되었습니다.",
  );
  const responseTimer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(responseTimeoutError);
  }, responseTimeoutMs);
  responseTimer.unref();

  let response: Response;
  try {
    response = await fetch(url, {
      headers: sanitizedHttpHeaders(headers),
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    detachAbortSignal();
    if (options.signal?.aborted) throw abortedOperation(options.signal);
    if (controller.signal.reason instanceof YoutubeSourceError) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    clearTimeout(responseTimer);
  }
  if (!response.ok || !response.body) {
    detachAbortSignal();
    controller.abort();
    const message = `YouTube Opus 스트림 연결에 실패했습니다 (HTTP ${response.status}).`;
    throw response.status === 403
      ? new YoutubeMediaForbiddenError(message)
      : new YoutubeSourceError(message);
  }

  const stream = Readable.fromWeb(
    response.body as NodeReadableStream<Uint8Array>,
  );
  try {
    await waitForFirstByte(
      stream,
      firstByteTimeoutMs,
      controller.signal,
      "YouTube 오디오 데이터 응답 시간이 초과되었습니다.",
      (error) => {
        if (!controller.signal.aborted) controller.abort(error);
        stream.destroy();
      },
    );
  } catch (error) {
    detachAbortSignal();
    if (!controller.signal.aborted) controller.abort(error);
    stream.destroy();
    if (options.signal?.aborted) throw abortedOperation(options.signal);
    if (error instanceof Error) throw error;
    throw new YoutubeSourceError("YouTube 오디오 데이터를 읽지 못했습니다.");
  }

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    detachAbortSignal();
    controller.abort();
    stream.destroy();
  };
  stream.once("close", () => {
    detachAbortSignal();
    if (!disposed && !controller.signal.aborted) controller.abort();
  });

  try {
    return {
      resource: createAudioResource(stream, {
        inputType: StreamType.WebmOpus,
        inlineVolume: false,
        metadata: track,
      }),
      qualityMode: "opus-passthrough",
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

function ffmpegHeaderBlock(headers: Record<string, string>): string | null {
  const entries = Object.entries(sanitizedHttpHeaders(headers));
  if (entries.length === 0) return null;
  return `${entries.map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n`;
}

/** 100% 기준 배율. FFmpeg volume 필터는 배율(1.0 = 원음)을 받는다. */
function volumeFilterValue(volumePercent: number): string {
  return (volumePercent / 100).toFixed(3);
}

export function buildFfmpegArgs(
  url: string,
  headers: Record<string, string>,
  responseTimeoutMs: number,
  options: { volumePercent?: number; seekSeconds?: number } = {},
): string[] {
  const headerBlock = ffmpegHeaderBlock(headers);
  const volumePercent = options.volumePercent ?? DEFAULT_VOLUME_PERCENT;
  const seekSeconds =
    typeof options.seekSeconds === "number" &&
    Number.isFinite(options.seekSeconds) &&
    options.seekSeconds > 0
      ? Math.floor(options.seekSeconds)
      : 0;
  return [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-nostdin",
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    "-rw_timeout",
    String(responseTimeoutMs * 1_000),
    ...(headerBlock ? ["-headers", headerBlock] : []),
    // 입력 앞의 -ss 는 디코딩을 건너뛰어 이어듣기 지연을 줄인다.
    ...(seekSeconds > 0 ? ["-ss", String(seekSeconds)] : []),
    "-i",
    url,
    "-map",
    "0:a:0",
    "-vn",
    "-sn",
    "-dn",
    ...(isDefaultVolume(volumePercent)
      ? []
      : ["-filter:a", `volume=${volumeFilterValue(volumePercent)}`]),
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "libopus",
    "-b:a",
    "128k",
    "-vbr",
    "on",
    "-compression_level",
    "10",
    "-application",
    "audio",
    "-frame_duration",
    "20",
    "-f",
    "opus",
    "pipe:1",
  ];
}

function safeFfmpegError(stderr: string): string {
  return stderr
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 500);
}

async function waitForSpawn(
  child: ChildProcess,
  signal: AbortSignal | undefined,
): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      child.removeListener("spawn", handleSpawn);
      child.removeListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleSpawn = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const handleAbort = (): void => {
      cleanup();
      reject(abortedOperation(signal));
    };
    child.once("spawn", handleSpawn);
    child.once("error", handleError);
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) handleAbort();
  });
}

async function createTranscodedResource(
  track: MusicTrack,
  url: string,
  headers: Record<string, string>,
  options: AudioResourceRequestOptions,
): Promise<ManagedAudioResource> {
  throwIfAborted(options.signal);
  const responseTimeoutMs = timeoutValue(
    options.responseTimeoutMs,
    DEFAULT_RESPONSE_TIMEOUT_MS,
  );
  const firstByteTimeoutMs = timeoutValue(
    options.firstByteTimeoutMs,
    DEFAULT_FIRST_BYTE_TIMEOUT_MS,
  );
  const child = spawn(
    getFfmpegExecutable(),
    buildFfmpegArgs(url, headers, responseTimeoutMs, {
      volumePercent: options.volumePercent,
      seekSeconds: options.seekSeconds,
    }),
    {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await waitForSpawn(child, options.signal);
  } catch (error) {
    if (!child.killed) child.kill("SIGKILL");
    if (options.signal?.aborted) throw abortedOperation(options.signal);
    throw new YoutubeSourceError("FFmpeg 오디오 변환을 시작하지 못했습니다.", {
      cause: error,
    });
  }

  let disposed = false;
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-MAX_FFMPEG_ERROR_BYTES);
  });

  const handleAbort = (): void => {
    child.stdout.destroy();
    if (!child.killed) child.kill("SIGTERM");
  };
  options.signal?.addEventListener("abort", handleAbort, { once: true });
  if (options.signal?.aborted) handleAbort();

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    options.signal?.removeEventListener("abort", handleAbort);
    child.stdout.destroy();
    child.stderr.destroy();
    if (!child.killed) child.kill("SIGTERM");
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 1_000);
    forceTimer.unref();
  };

  child.once("close", (code, signal) => {
    options.signal?.removeEventListener("abort", handleAbort);
    if (!disposed && code !== 0) {
      const detail = safeFfmpegError(stderr);
      child.stdout.destroy(
        FORBIDDEN_STDERR_PATTERN.test(stderr)
          ? new YoutubeMediaForbiddenError(
              `YouTube 오디오 서버가 변환 요청을 거부했습니다 (HTTP 403): ${detail}`,
            )
          : new YoutubeSourceError(
              `FFmpeg 변환이 중단되었습니다 (code=${code}, signal=${signal ?? "none"}): ${detail}`,
            ),
      );
    }
  });
  try {
    await waitForFirstByte(
      child.stdout,
      firstByteTimeoutMs,
      options.signal ?? new AbortController().signal,
      "FFmpeg 오디오 변환 데이터 응답 시간이 초과되었습니다.",
      () => dispose(),
    );
    return {
      resource: createAudioResource(child.stdout, {
        inputType: StreamType.OggOpus,
        inlineVolume: false,
        metadata: track,
      }),
      qualityMode: "opus-transcode",
      dispose,
    };
  } catch (error) {
    dispose();
    if (options.signal?.aborted) throw abortedOperation(options.signal);
    throw error;
  }
}

/** 이미 검증된 미디어 소스에 맞춰 무손실 전달 또는 1회 변환 경로를 만든다. */
export async function createAudioResourceFromMedia(
  track: MusicTrack,
  media: YoutubeMediaSource,
  options: AudioResourceRequestOptions = {},
): Promise<ManagedAudioResource> {
  const volumePercent = options.volumePercent ?? DEFAULT_VOLUME_PERCENT;
  // 무손실 전달은 음량 조절과 이어듣기를 지원하지 않는다. 둘 중 하나가 필요하면
  // FFmpeg 경로로 넘긴다 — 기본 음량으로 재생하는 동안은 원래대로 무손실이다.
  const needsFfmpeg =
    options.forceTranscode === true ||
    !isDefaultVolume(volumePercent) ||
    (options.seekSeconds ?? 0) > 0;
  if (media.qualityMode === "opus-passthrough" && !needsFfmpeg) {
    return createPassthroughResource(track, media.url, media.headers, options);
  }
  return createTranscodedResource(track, media.url, media.headers, options);
}

/**
 * 재생 가능한 오디오 경로를 찾을 때까지 해석 프로필을 바꿔가며 시도한다.
 *
 * 만료된 서명 URL은 같은 프로필로 다시 해석하면 복구되지만, googlevideo가 403으로
 * 거부한 경우에는 같은 player client로 다시 받아도 동일한 제한이 걸린다. 그래서
 * 403일 때만 다음 프로필로 넘어가고, 그 외 실패는 재해석 한 번으로 제한한다.
 */
export async function createYoutubeAudioResource(
  track: MusicTrack,
  options: AudioResourceRequestOptions = {},
): Promise<ManagedAudioResource> {
  let profile = 0;
  let refreshAttempted = false;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RESOURCE_ATTEMPTS; attempt += 1) {
    const media = await resolveYoutubeMedia(track.url, {
      signal: options.signal,
      profile,
    });
    try {
      return await createAudioResourceFromMedia(track, media, options);
    } catch (error) {
      if (options.signal?.aborted) throw abortedOperation(options.signal);
      if (isMusicOperationAbortedError(error)) throw error;
      lastError = error;

      if (isYoutubeMediaForbiddenError(error)) {
        if (profile + 1 >= MEDIA_RESOLVE_PROFILE_COUNT) throw error;
        profile += 1;
        console.warn(
          `[music] 미디어 URL이 403으로 거부되어 player client 프로필을 교체합니다 ` +
            `track=${track.videoId} profile=${profile}`,
        );
        continue;
      }
      if (refreshAttempted) throw error;
      refreshAttempted = true;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new YoutubeSourceError("YouTube 오디오 스트림을 준비하지 못했습니다.");
}
