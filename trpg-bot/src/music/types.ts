/** YouTube 원본을 Discord 로 전달하는 오디오 경로. */
export type AudioQualityMode = "opus-passthrough" | "opus-transcode";

/** 길드별 음악 세션에 적용하는 반복 재생 방식. */
export const MusicRepeatMode = {
  off: "off",
  track: "track",
  queue: "queue",
} as const;

export type MusicRepeatMode =
  (typeof MusicRepeatMode)[keyof typeof MusicRepeatMode];

export function isMusicRepeatMode(value: string): value is MusicRepeatMode {
  return Object.values(MusicRepeatMode).includes(value as MusicRepeatMode);
}

/** 대기열에 저장하는 YouTube 트랙 메타데이터. */
export interface MusicTrack {
  videoId: string;
  title: string;
  url: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  isLive: boolean;
  preferredQualityMode: AudioQualityMode;
  requestedById: string;
  requestedByName: string;
}

/** 사용자가 바로 이해할 수 있는 음악 명령 오류. */
export class MusicUserError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MusicUserError";
  }
}

/** 음량 기본값과 허용 범위(%). */
export const DEFAULT_VOLUME_PERCENT = 100;
export const MIN_VOLUME_PERCENT = 0;
export const MAX_VOLUME_PERCENT = 200;

/**
 * 100%를 넘기면 FFmpeg 증폭으로 클리핑이 생길 수 있다. 막지는 않되 경고 기준으로 쓴다.
 */
export const VOLUME_CLIPPING_THRESHOLD_PERCENT = 100;

export function isDefaultVolume(percent: number): boolean {
  return percent === DEFAULT_VOLUME_PERCENT;
}

/** 사용자 입력 음량을 허용 범위 정수로 정규화한다. */
export function normalizeVolumePercent(value: number): number {
  if (!Number.isFinite(value)) {
    throw new MusicUserError("음량은 숫자로 입력해 주세요.");
  }
  const rounded = Math.round(value);
  if (rounded < MIN_VOLUME_PERCENT || rounded > MAX_VOLUME_PERCENT) {
    throw new MusicUserError(
      `음량은 ${MIN_VOLUME_PERCENT}%부터 ${MAX_VOLUME_PERCENT}% 사이로 입력해 주세요.`,
    );
  }
  return rounded;
}

/** 건너뛰기·초기화·퇴장·종료로 정상 취소된 음악 준비 작업. */
export class MusicOperationAbortedError extends Error {
  constructor(message = "음악 재생 준비가 취소되었습니다.", options?: ErrorOptions) {
    super(message, options);
    this.name = "MusicOperationAbortedError";
  }
}

export function isMusicOperationAbortedError(
  error: unknown,
): error is MusicOperationAbortedError {
  return error instanceof MusicOperationAbortedError;
}
