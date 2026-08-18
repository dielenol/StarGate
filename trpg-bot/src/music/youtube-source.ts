/**
 * yt-dlp 기반 YouTube 검색·미디어 URL 해석.
 *
 * 사용자 입력은 YouTube URL 또는 ytsearch1 검색으로만 제한한다. 실행은 shell을
 * 거치지 않고 인자 배열로 전달해 명령 삽입과 로컬 파일 접근을 막는다.
 */

import { spawn } from "node:child_process";

import {
  MusicOperationAbortedError,
  isMusicOperationAbortedError,
  type AudioQualityMode,
} from "./types.js";

const YT_DLP_TIMEOUT_MS = 45_000;
const YT_DLP_PLAYLIST_TIMEOUT_MS = 60_000;
const PROCESS_OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;
const MAX_SEARCH_LENGTH = 200;
export const MAX_PLAYLIST_TRACKS_PER_REQUEST = 50;

/** Opus/WebM을 최우선으로 선택하고 없을 때만 다른 최상 음원을 사용한다. */
const AUDIO_FORMAT_SELECTOR =
  "bestaudio[ext=webm][acodec^=opus]/bestaudio[acodec^=opus]/bestaudio/best";

/** 폴백 프로필은 포맷 제약을 풀어 HLS·m4a 음원까지 후보로 둔다. */
const FALLBACK_AUDIO_FORMAT_SELECTOR = "bestaudio/best";

/**
 * gvs PO token을 요구하지 않는 player client를 우선 사용한다.
 *
 * YouTube가 특정 client의 미디어 URL을 막으면 googlevideo 응답이 403이 되고 같은
 * client로 다시 해석해도 같은 제한이 걸린다. 그래서 기본 프로필과 폴백 프로필을
 * 서로 다른 client로 구성하고, 배포 없이 교체할 수 있게 환경변수 재정의를 둔다.
 *
 * gvs PO token 없이 HTTPS 음원을 받을 수 있는 client는 `tv`, `tv_downgraded`,
 * `visionos`, `web_embedded` 뿐이다. `android*`·`ios`·`mweb`·`web`·`web_safari`는
 * PO token을 요구하므로 provider 없이 지정하면 다시 403으로 돌아온다.
 */
const DEFAULT_PLAYER_CLIENTS = "tv,visionos";
const FALLBACK_PLAYER_CLIENTS = "visionos,tv_downgraded";
const PLAYER_CLIENT_PATTERN = /^[\da-z_.-]+(?:,[\da-z_.-]+)*$/;

const ALLOWED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
]);

interface YtDlpDownload {
  url?: unknown;
  protocol?: unknown;
  ext?: unknown;
  acodec?: unknown;
  vcodec?: unknown;
  http_headers?: unknown;
}

interface YtDlpInfo extends YtDlpDownload {
  id?: unknown;
  title?: unknown;
  webpage_url?: unknown;
  original_url?: unknown;
  duration?: unknown;
  thumbnail?: unknown;
  thumbnails?: unknown;
  is_live?: unknown;
  live_status?: unknown;
  availability?: unknown;
  playlist_count?: unknown;
  n_entries?: unknown;
  requested_downloads?: unknown;
  entries?: unknown;
}

export interface YoutubeTrackMetadata {
  videoId: string;
  title: string;
  url: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  isLive: boolean;
  preferredQualityMode: AudioQualityMode;
}

export interface YoutubePlaylistMetadata {
  title: string;
  tracks: YoutubeTrackMetadata[];
  sourceTrackCount: number | null;
  truncated: boolean;
}

export interface YoutubeMediaSource {
  url: string;
  headers: Record<string, string>;
  protocol: string;
  isLive: boolean;
  qualityMode: AudioQualityMode;
}

export interface MusicRuntimeInfo {
  ytDlpVersion: string;
  ffmpegVersion: string;
}

export interface YoutubeResolveOptions {
  signal?: AbortSignal;
  /** 403 회피용 player client 프로필 인덱스. 0이 기본 경로다. */
  profile?: number;
}

/** 미디어 URL 해석에 사용하는 player client·포맷 조합. */
export interface MediaResolveProfile {
  readonly label: string;
  readonly playerClients: string;
  readonly formatSelector: string;
  readonly preferHttpsProtocol: boolean;
}

export const MEDIA_RESOLVE_PROFILE_COUNT = 2;

export class YoutubeSourceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "YoutubeSourceError";
  }
}

/** googlevideo가 미디어 URL 자체를 거부한 경우 (player client·PO token 제한). */
export class YoutubeMediaForbiddenError extends YoutubeSourceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "YoutubeMediaForbiddenError";
  }
}

export function isYoutubeMediaForbiddenError(
  error: unknown,
): error is YoutubeMediaForbiddenError {
  return error instanceof YoutubeMediaForbiddenError;
}

class ProcessExecutionError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProcessExecutionError";
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean);
}

export function getYtDlpExecutable(): string {
  return firstNonEmpty(process.env.YT_DLP_PATH) ?? "yt-dlp";
}

export function getFfmpegExecutable(): string {
  return firstNonEmpty(process.env.FFMPEG_PATH) ?? "ffmpeg";
}

/** 기본 프로필의 player client 목록. 형식이 잘못된 재정의는 무시한다. */
export function getPlayerClients(): string {
  const configured = firstNonEmpty(
    process.env.YT_DLP_PLAYER_CLIENTS,
  )?.toLowerCase();
  if (!configured) return DEFAULT_PLAYER_CLIENTS;
  if (PLAYER_CLIENT_PATTERN.test(configured)) return configured;
  console.warn(
    "[music] YT_DLP_PLAYER_CLIENTS 형식이 올바르지 않아 기본값을 사용합니다.",
  );
  return DEFAULT_PLAYER_CLIENTS;
}

/** bgutil POT provider HTTP 주소. 없으면 PO token 없이 해석한다. */
export function getPotProviderBaseUrl(): string | null {
  const raw = firstNonEmpty(process.env.YT_DLP_POT_PROVIDER_URL);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new TypeError("unsupported protocol");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    console.warn(
      "[music] YT_DLP_POT_PROVIDER_URL이 올바른 HTTP 주소가 아니어서 무시합니다.",
    );
    return null;
  }
}

export function mediaResolveProfile(index: number): MediaResolveProfile {
  const clamped = Math.min(
    Math.max(Number.isFinite(index) ? Math.floor(index) : 0, 0),
    MEDIA_RESOLVE_PROFILE_COUNT - 1,
  );
  return clamped === 0
    ? {
        label: "primary",
        playerClients: getPlayerClients(),
        formatSelector: AUDIO_FORMAT_SELECTOR,
        preferHttpsProtocol: true,
      }
    : {
        label: "fallback",
        playerClients: FALLBACK_PLAYER_CLIENTS,
        formatSelector: FALLBACK_AUDIO_FORMAT_SELECTOR,
        preferHttpsProtocol: false,
      };
}

function isAllowedYoutubeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (ALLOWED_YOUTUBE_HOSTS.has(normalized)) return true;
  return [...ALLOWED_YOUTUBE_HOSTS].some((host) =>
    normalized.endsWith(`.${host}`),
  );
}

/** YouTube URL이면 검증된 URL, 그 외에는 한 건만 찾는 ytsearch 입력을 반환한다. */
export function normalizeYoutubeRequest(rawInput: string): string {
  const input = rawInput.trim();
  if (!input) {
    throw new YoutubeSourceError("재생할 YouTube 링크나 검색어를 입력해 주세요.");
  }

  const urlCandidate = input.startsWith("www.") ? `https://${input}` : input;
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(urlCandidate);
  } catch {
    parsedUrl = null;
  }

  if (parsedUrl) {
    if (
      (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") ||
      parsedUrl.username ||
      parsedUrl.password ||
      !isAllowedYoutubeHostname(parsedUrl.hostname)
    ) {
      throw new YoutubeSourceError("YouTube 링크만 재생할 수 있습니다.");
    }
    // YouTube HTTP 링크는 동일 호스트의 HTTPS로 올려 외부 도구에 전달한다.
    parsedUrl.protocol = "https:";
    return parsedUrl.toString();
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(input)) {
    throw new YoutubeSourceError("올바른 YouTube 링크나 검색어를 입력해 주세요.");
  }
  if (input.length > MAX_SEARCH_LENGTH) {
    throw new YoutubeSourceError(
      `검색어는 ${MAX_SEARCH_LENGTH}자 이내로 입력해 주세요.`,
    );
  }
  return `ytsearch1:${input}`;
}

/** 명시적인 YouTube 재생목록 URL만 허용하고 `list` 식별자를 검증한다. */
export function normalizeYoutubePlaylistRequest(rawInput: string): string {
  const input = normalizeYoutubeRequest(rawInput);
  if (input.startsWith("ytsearch1:")) {
    throw new YoutubeSourceError("YouTube 재생목록 링크를 입력해 주세요.");
  }
  const parsed = new URL(input);
  if (!parsed.searchParams.get("list")?.trim()) {
    throw new YoutubeSourceError(
      "재생목록 식별자가 포함된 YouTube 링크를 입력해 주세요.",
    );
  }
  return parsed.toString();
}

function appendWithLimit(
  chunks: Buffer[],
  chunk: Buffer,
  currentBytes: number,
): number {
  const nextBytes = currentBytes + chunk.byteLength;
  if (nextBytes > PROCESS_OUTPUT_LIMIT_BYTES) {
    throw new ProcessExecutionError("외부 도구 출력이 허용 크기를 초과했습니다.", "");
  }
  chunks.push(chunk);
  return nextBytes;
}

function abortedOperation(signal: AbortSignal | undefined): MusicOperationAbortedError {
  return signal?.reason instanceof MusicOperationAbortedError
    ? signal.reason
    : new MusicOperationAbortedError();
}

async function runProcess(
  executable: string,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  if (signal?.aborted) throw abortedOperation(signal);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
    };

    const finishReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!child.killed) child.kill("SIGKILL");
      reject(error);
    };

    const timer = setTimeout(() => {
      finishReject(
        new ProcessExecutionError(
          `${executable} 실행 시간이 ${timeoutMs}ms를 초과했습니다.`,
          Buffer.concat(stderrChunks).toString("utf8"),
        ),
      );
    }, timeoutMs);
    timer.unref();

    function handleAbort(): void {
      finishReject(abortedOperation(signal));
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
      return;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      try {
        stdoutBytes = appendWithLimit(stdoutChunks, chunk, stdoutBytes);
      } catch (error) {
        finishReject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      try {
        stderrBytes = appendWithLimit(stderrChunks, chunk, stderrBytes);
      } catch (error) {
        finishReject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.once("error", (error) => {
      finishReject(
        new ProcessExecutionError(
          `${executable} 실행에 실패했습니다: ${error.message}`,
          Buffer.concat(stderrChunks).toString("utf8"),
          { cause: error },
        ),
      );
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        reject(
          new ProcessExecutionError(
            `${executable}가 비정상 종료했습니다 (code=${code}, signal=${signal ?? "none"}).`,
            stderr,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function firstInfoEntry(root: YtDlpInfo): YtDlpInfo {
  if (!Array.isArray(root.entries)) return root;
  const first = root.entries.map(asRecord).find(Boolean);
  if (!first) throw new YoutubeSourceError("검색 결과를 찾지 못했습니다.");
  return first as YtDlpInfo;
}

function selectedDownload(info: YtDlpInfo): YtDlpDownload {
  if (!Array.isArray(info.requested_downloads)) return info;
  const first = info.requested_downloads.map(asRecord).find(Boolean);
  return (first as YtDlpDownload | undefined) ?? info;
}

function lastThumbnailUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = asRecord(value[index]);
    const url = asString(item?.url);
    if (url) return url;
  }
  return null;
}

function safeHttpUrl(value: unknown): string | null {
  const candidate = asString(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeHeaders(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, headerValue]) => {
      const normalized = asString(headerValue)?.replace(/[\r\n]/g, "");
      return normalized && /^[!#$%&'*+.^_`|~\dA-Za-z-]+$/.test(key)
        ? [[key, normalized]]
        : [];
    }),
  );
}

export function isWebmOpusFormat(format: {
  ext?: unknown;
  acodec?: unknown;
  protocol?: unknown;
}): boolean {
  const ext = asString(format.ext)?.toLowerCase();
  const acodec = asString(format.acodec)?.toLowerCase();
  const protocol = asString(format.protocol)?.toLowerCase();
  return (
    ext === "webm" &&
    Boolean(acodec?.startsWith("opus")) &&
    (protocol === undefined || protocol === "http" || protocol === "https")
  );
}

function qualityModeFor(format: YtDlpDownload): AudioQualityMode {
  return isWebmOpusFormat(format) ? "opus-passthrough" : "opus-transcode";
}

function parseInfoJson(raw: string): YtDlpInfo {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = asRecord(parsed);
    if (!record) throw new SyntaxError("root is not an object");
    return record as YtDlpInfo;
  } catch (error) {
    throw new YoutubeSourceError("yt-dlp 응답을 해석하지 못했습니다.", {
      cause: error,
    });
  }
}

function normalizedDuration(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

function normalizedTrackUrl(info: YtDlpInfo): string | null {
  const candidate =
    asString(info.webpage_url) ??
    asString(info.original_url) ??
    asString(info.url);
  if (candidate) {
    try {
      const normalized = normalizeYoutubeRequest(candidate);
      if (!normalized.startsWith("ytsearch1:")) return normalized;
    } catch {
      // flat-playlist의 `url`이 영상 ID인 경우 아래 표준 URL을 사용한다.
    }
  }
  const videoId = asString(info.id);
  return videoId && /^[\w-]{6,64}$/.test(videoId)
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    : null;
}

function isUnavailablePlaylistEntry(info: YtDlpInfo): boolean {
  const availability = asString(info.availability)?.toLowerCase();
  const title = asString(info.title)?.toLowerCase();
  return (
    availability === "private" ||
    availability === "premium_only" ||
    availability === "subscriber_only" ||
    availability === "needs_auth" ||
    title === "[private video]" ||
    title === "[deleted video]"
  );
}

function trackMetadataFromInfo(
  info: YtDlpInfo,
  allowMissingFormat: boolean,
): YoutubeTrackMetadata | null {
  if (isUnavailablePlaylistEntry(info)) return null;
  const videoId = asString(info.id);
  const title = asString(info.title);
  const url = normalizedTrackUrl(info);
  if (!videoId || !title || !url) return null;
  const format = selectedDownload(info);
  return {
    videoId,
    title,
    url,
    durationSeconds: normalizedDuration(info.duration),
    thumbnailUrl:
      safeHttpUrl(info.thumbnail) ?? safeHttpUrl(lastThumbnailUrl(info.thumbnails)),
    isLive: info.is_live === true || info.live_status === "is_live",
    // flat-playlist에는 포맷 정보가 없다. 실제 재생 직전에 다시 해석하므로
    // 이 값은 힌트일 뿐이며 상태판에는 실제 사용한 경로만 표시한다.
    preferredQualityMode:
      allowMissingFormat && !asString(format.ext)
        ? "opus-passthrough"
        : qualityModeFor(format),
  };
}

/** 테스트와 실제 해석에서 공유하는 트랙 메타데이터 정규화. */
export function parseYoutubeTrackMetadata(raw: string): YoutubeTrackMetadata {
  const info = firstInfoEntry(parseInfoJson(raw));
  const metadata = trackMetadataFromInfo(info, false);
  if (!metadata) {
    throw new YoutubeSourceError("YouTube 영상 메타데이터가 불완전합니다.");
  }
  return metadata;
}

/** flat-playlist 응답을 재생 가능한 트랙 목록으로 정규화한다. */
export function parseYoutubePlaylistMetadata(
  raw: string,
  maxTracks = MAX_PLAYLIST_TRACKS_PER_REQUEST,
): YoutubePlaylistMetadata {
  const root = parseInfoJson(raw);
  if (!Array.isArray(root.entries)) {
    throw new YoutubeSourceError("YouTube 재생목록을 찾지 못했습니다.");
  }
  const entries = root.entries
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .slice(0, maxTracks);
  const tracks = entries.flatMap((entry) => {
    const metadata = trackMetadataFromInfo(entry as YtDlpInfo, true);
    return metadata ? [metadata] : [];
  });
  if (tracks.length === 0) {
    throw new YoutubeSourceError(
      "재생목록에서 재생 가능한 공개 영상을 찾지 못했습니다.",
    );
  }
  const rawCount =
    typeof root.playlist_count === "number"
      ? root.playlist_count
      : typeof root.n_entries === "number"
        ? root.n_entries
        : null;
  const sourceTrackCount =
    rawCount !== null && Number.isFinite(rawCount)
      ? Math.max(0, Math.floor(rawCount))
      : null;
  return {
    title: asString(root.title) ?? "YouTube 재생목록",
    tracks,
    sourceTrackCount,
    truncated:
      sourceTrackCount !== null
        ? sourceTrackCount > entries.length
        : entries.length >= maxTracks,
  };
}

/** 테스트와 실제 재생에서 공유하는 직접 미디어 정보 정규화. */
export function parseYoutubeMediaSource(raw: string): YoutubeMediaSource {
  const info = firstInfoEntry(parseInfoJson(raw));
  const download = selectedDownload(info);
  const url = asString(download.url);
  if (!url) {
    throw new YoutubeSourceError("재생 가능한 YouTube 오디오 주소를 찾지 못했습니다.");
  }
  try {
    const mediaUrl = new URL(url);
    if (mediaUrl.protocol !== "https:" && mediaUrl.protocol !== "http:") {
      throw new TypeError("unsupported media protocol");
    }
  } catch (error) {
    throw new YoutubeSourceError("YouTube가 안전하지 않은 미디어 주소를 반환했습니다.", {
      cause: error,
    });
  }
  return {
    url,
    headers: normalizeHeaders(download.http_headers ?? info.http_headers),
    protocol: asString(download.protocol) ?? "unknown",
    isLive: info.is_live === true || info.live_status === "is_live",
    qualityMode: qualityModeFor(download),
  };
}

/** yt-dlp extractor 인자. POT provider가 설정된 경우에만 주소를 넘긴다. */
function extractorArgs(playerClients: string): string[] {
  const args = ["--extractor-args", `youtube:player_client=${playerClients}`];
  const potBaseUrl = getPotProviderBaseUrl();
  if (potBaseUrl) {
    args.push(
      "--extractor-args",
      `youtubepot-bgutilhttp:base_url=${potBaseUrl}`,
    );
  }
  return args;
}

/** 테스트와 실제 해석에서 공유하는 단일 영상 해석 인자. */
export function buildYtDlpInfoArgs(
  input: string,
  profileIndex = 0,
): string[] {
  const profile = mediaResolveProfile(profileIndex);
  return [
    "--ignore-config",
    "--dump-single-json",
    "--no-playlist",
    "--playlist-end",
    "1",
    "--skip-download",
    "--no-warnings",
    "--socket-timeout",
    "20",
    "--extractor-retries",
    "3",
    "--js-runtimes",
    "node",
    ...extractorArgs(profile.playerClients),
    "-f",
    profile.formatSelector,
    ...(profile.preferHttpsProtocol ? ["-S", "proto:https"] : []),
    "--",
    input,
  ];
}

function ytDlpPlaylistArgs(input: string): string[] {
  return [
    "--ignore-config",
    "--dump-single-json",
    "--flat-playlist",
    "--yes-playlist",
    "--playlist-end",
    String(MAX_PLAYLIST_TRACKS_PER_REQUEST),
    "--skip-download",
    "--no-warnings",
    "--socket-timeout",
    "20",
    "--extractor-retries",
    "3",
    "--js-runtimes",
    "node",
    ...extractorArgs(getPlayerClients()),
    "--",
    input,
  ];
}

function sourceFailureMessage(error: unknown): string {
  const stderr =
    error instanceof ProcessExecutionError ? error.stderr.trim() : "";
  const detail = stderr || (error instanceof Error ? error.message : String(error));
  if (/no video results|unable to extract|unsupported url/i.test(detail)) {
    return "YouTube 검색 결과를 찾지 못했거나 지원하지 않는 링크입니다.";
  }
  if (/private video|video unavailable|members-only|has been removed/i.test(detail)) {
    return "비공개·삭제·멤버십 영상은 재생할 수 없습니다.";
  }
  if (/sign in|confirm.*not a bot|cookies/i.test(detail)) {
    return "YouTube가 서버의 재생 요청을 제한했습니다. 잠시 뒤 다시 시도해 주세요.";
  }
  if (/http error 403|403:? forbidden/i.test(detail)) {
    return "YouTube가 서버 IP의 재생 요청을 차단했습니다 (HTTP 403). 운영자 확인이 필요합니다.";
  }
  if (/ENOENT|spawn .* not found/i.test(detail)) {
    return "서버에 yt-dlp가 설치되어 있지 않습니다.";
  }
  return "YouTube 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
}

export async function resolveYoutubeTrack(
  rawInput: string,
  options: YoutubeResolveOptions = {},
): Promise<YoutubeTrackMetadata> {
  const input = normalizeYoutubeRequest(rawInput);
  try {
    const { stdout } = await runProcess(
      getYtDlpExecutable(),
      buildYtDlpInfoArgs(input, options.profile ?? 0),
      YT_DLP_TIMEOUT_MS,
      options.signal,
    );
    return parseYoutubeTrackMetadata(stdout);
  } catch (error) {
    if (isMusicOperationAbortedError(error)) throw error;
    if (error instanceof YoutubeSourceError) throw error;
    throw new YoutubeSourceError(sourceFailureMessage(error), { cause: error });
  }
}

export async function resolveYoutubePlaylist(
  rawInput: string,
  options: YoutubeResolveOptions = {},
): Promise<YoutubePlaylistMetadata> {
  const input = normalizeYoutubePlaylistRequest(rawInput);
  try {
    const { stdout } = await runProcess(
      getYtDlpExecutable(),
      ytDlpPlaylistArgs(input),
      YT_DLP_PLAYLIST_TIMEOUT_MS,
      options.signal,
    );
    return parseYoutubePlaylistMetadata(stdout);
  } catch (error) {
    if (isMusicOperationAbortedError(error)) throw error;
    if (error instanceof YoutubeSourceError) throw error;
    throw new YoutubeSourceError(sourceFailureMessage(error), { cause: error });
  }
}

export async function resolveYoutubeMedia(
  videoUrl: string,
  options: YoutubeResolveOptions = {},
): Promise<YoutubeMediaSource> {
  try {
    const { stdout } = await runProcess(
      getYtDlpExecutable(),
      buildYtDlpInfoArgs(
        normalizeYoutubeRequest(videoUrl),
        options.profile ?? 0,
      ),
      YT_DLP_TIMEOUT_MS,
      options.signal,
    );
    return parseYoutubeMediaSource(stdout);
  } catch (error) {
    if (isMusicOperationAbortedError(error)) throw error;
    if (error instanceof YoutubeSourceError) throw error;
    throw new YoutubeSourceError(sourceFailureMessage(error), { cause: error });
  }
}

export async function inspectMusicRuntime(): Promise<MusicRuntimeInfo> {
  try {
    const [{ stdout: ytDlpVersion }, { stdout: ffmpegVersion }] =
      await Promise.all([
        runProcess(getYtDlpExecutable(), ["--version"], 15_000),
        runProcess(getFfmpegExecutable(), ["-version"], 15_000),
      ]);
    return {
      ytDlpVersion: ytDlpVersion.trim().split(/\s+/)[0] ?? "unknown",
      ffmpegVersion:
        ffmpegVersion.trim().split(/\r?\n/, 1)[0] ?? "unknown",
    };
  } catch (error) {
    throw new YoutubeSourceError(
      "음악 재생에 필요한 yt-dlp 또는 FFmpeg를 실행할 수 없습니다.",
      { cause: error },
    );
  }
}
