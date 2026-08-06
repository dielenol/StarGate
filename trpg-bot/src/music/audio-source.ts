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

import type { AudioQualityMode, MusicTrack } from "./types.js";
import {
  getFfmpegExecutable,
  resolveYoutubeMedia,
  YoutubeSourceError,
  type YoutubeMediaSource,
} from "./youtube-source.js";

const MAX_FFMPEG_ERROR_BYTES = 16 * 1024;

export interface ManagedAudioResource {
  resource: AudioResource<MusicTrack>;
  qualityMode: AudioQualityMode;
  dispose(): void;
}

function sanitizedHttpHeaders(headers: Record<string, string>): Record<string, string> {
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

async function createPassthroughResource(
  track: MusicTrack,
  url: string,
  headers: Record<string, string>,
): Promise<ManagedAudioResource> {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: sanitizedHttpHeaders(headers),
    redirect: "follow",
    signal: controller.signal,
  });
  if (!response.ok || !response.body) {
    controller.abort();
    throw new YoutubeSourceError(
      `YouTube Opus 스트림 연결에 실패했습니다 (HTTP ${response.status}).`,
    );
  }

  const stream = Readable.fromWeb(
    response.body as NodeReadableStream<Uint8Array>,
  );
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    stream.destroy();
  };
  stream.once("close", () => {
    if (!disposed) controller.abort();
  });

  return {
    resource: createAudioResource(stream, {
      inputType: StreamType.WebmOpus,
      inlineVolume: false,
      metadata: track,
    }),
    qualityMode: "opus-passthrough",
    dispose,
  };
}

function ffmpegHeaderBlock(headers: Record<string, string>): string | null {
  const entries = Object.entries(sanitizedHttpHeaders(headers));
  if (entries.length === 0) return null;
  return `${entries.map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n`;
}

function buildFfmpegArgs(
  url: string,
  headers: Record<string, string>,
): string[] {
  const headerBlock = ffmpegHeaderBlock(headers);
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
    ...(headerBlock ? ["-headers", headerBlock] : []),
    "-i",
    url,
    "-map",
    "0:a:0",
    "-vn",
    "-sn",
    "-dn",
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

async function waitForSpawn(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
}

async function createTranscodedResource(
  track: MusicTrack,
  url: string,
  headers: Record<string, string>,
): Promise<ManagedAudioResource> {
  const child = spawn(
    getFfmpegExecutable(),
    buildFfmpegArgs(url, headers),
    {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await waitForSpawn(child);
  } catch (error) {
    if (!child.killed) child.kill("SIGKILL");
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

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    child.stdout.destroy();
    child.stderr.destroy();
    if (!child.killed) child.kill("SIGTERM");
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 1_000);
    forceTimer.unref();
  };

  child.once("close", (code, signal) => {
    if (!disposed && code !== 0) {
      child.stdout.destroy(
        new YoutubeSourceError(
          `FFmpeg 변환이 중단되었습니다 (code=${code}, signal=${signal ?? "none"}): ${safeFfmpegError(stderr)}`,
        ),
      );
    }
  });
  return {
    resource: createAudioResource(child.stdout, {
      inputType: StreamType.OggOpus,
      inlineVolume: false,
      metadata: track,
    }),
    qualityMode: "opus-transcode",
    dispose,
  };
}

/** 이미 검증된 미디어 소스에 맞춰 무손실 전달 또는 1회 변환 경로를 만든다. */
export async function createAudioResourceFromMedia(
  track: MusicTrack,
  media: YoutubeMediaSource,
): Promise<ManagedAudioResource> {
  if (media.qualityMode === "opus-passthrough") {
    return createPassthroughResource(track, media.url, media.headers);
  }
  return createTranscodedResource(track, media.url, media.headers);
}

export async function createYoutubeAudioResource(
  track: MusicTrack,
): Promise<ManagedAudioResource> {
  const media = await resolveYoutubeMedia(track.url);
  if (media.qualityMode === "opus-passthrough") {
    try {
      return await createAudioResourceFromMedia(track, media);
    } catch {
      // 서명 URL 만료·일시 403은 한 번 다시 해석해 새 URL로 재시도한다.
      const refreshed = await resolveYoutubeMedia(track.url);
      return createAudioResourceFromMedia(track, refreshed);
    }
  }
  return createAudioResourceFromMedia(track, media);
}
