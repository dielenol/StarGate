/** YouTube 원본을 Discord 로 전달하는 오디오 경로. */
export type AudioQualityMode = "opus-passthrough" | "opus-transcode";

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
