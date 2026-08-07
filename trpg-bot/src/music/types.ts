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
