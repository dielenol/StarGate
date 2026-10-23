/**
 * 환경변수 검증 및 내보내기
 *
 * 필수 값(DISCORD_TOKEN, DISCORD_CLIENT_ID, MONGODB_URI, TRPG_GUILD_ID,
 * TRPG_FALLBACK_CHANNEL_ID, TRPG_WEB_BASE_URL)이 없거나 형식이 틀리면 기동을
 * 막는다. 주기 값은 허용 범위를 벗어나면 경고 후 기본값을 쓰고, 선택 기능
 * (음악·운영 알림·생존 신호)은 값이 없으면 해당 기능만 꺼진다.
 *
 * @module config
 */

import "dotenv/config";

/** setTimeout/setInterval 이 받는 최대 지연(32비트 부호 정수). 넘기면 1ms 로 동작한다. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * 주기·지연 환경변수(ms)를 읽는다.
 *
 * 미설정이면 기본값, 숫자가 아니거나 `[min, max]` 밖이면 경고 후 기본값을 쓴다.
 * 0ms 폴링 루프나 32비트 타이머 오버플로(사실상 1ms 반복)를 막기 위한 공통 경계.
 */
function readIntervalMs(
  name: string,
  defaultMs: number,
  { min, max }: { min: number; max: number },
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultMs;
  const n = Number(raw);
  const upper = Math.min(max, MAX_TIMER_DELAY_MS);
  if (!Number.isFinite(n) || n < min || n > upper) {
    console.warn(
      `[config] ${name}=${raw} 은 허용 범위(${min}~${upper}ms)를 벗어나 기본값 ${defaultMs}ms 를 사용합니다.`,
    );
    return defaultMs;
  }
  return Math.floor(n);
}

/** `0` / `false` / `off` 이면 false, 그 외(미설정 포함)는 기본값을 따르는 on/off 플래그. */
function readBooleanFlag(name: string, defaultValue: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return defaultValue;
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

/** http(s) URL 인지 검증한다. 형식이 틀리면 사유 문자열, 정상이면 null. */
function invalidHttpUrlReason(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "URL 형식이 아닙니다";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return `http/https 가 아닌 스킴(${parsed.protocol})입니다`;
  }
  return null;
}

/** 환경변수에서 Discord 봇 토큰을 읽어 반환합니다. */
function getDiscordToken(): string {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN 환경변수가 설정되지 않았습니다.");
  }
  return token;
}

/** 환경변수에서 Discord Application (Client) ID를 읽어 반환합니다. */
function getDiscordClientId(): string {
  const id = process.env.DISCORD_CLIENT_ID;
  if (!id) {
    throw new Error("DISCORD_CLIENT_ID 환경변수가 설정되지 않았습니다.");
  }
  return id;
}

/** 환경변수에서 MongoDB 연결 문자열을 읽어 반환합니다. */
function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
  }
  return uri;
}

/**
 * 통합 DB 이름.
 *
 * 이전엔 봇 자체적으로 `trpg_bot` DB를 사용했으나, Phase 1 에서 registra-bot /
 * StarGateV2 와 같은 `stargate` 통합 DB 로 합쳐졌다. URI 의 database path 는
 * 무시되고, 항상 이 상수가 적용된다 (운영 일관성 + shared-db 인덱스 통합).
 *
 * 필요 시 `MONGODB_DB_NAME` 환경변수로 override 가능 (테스트/스테이징).
 */
function getMongoDbName(): string {
  return process.env.MONGODB_DB_NAME?.trim() || "stargate";
}

/** 개발용: 특정 길드에만 커맨드를 등록할 때 사용 (선택) */
function getGuildId(): string | undefined {
  return process.env.GUILD_ID;
}

/**
 * trpg-bot 운영 길드 ID (Phase 2 필수).
 *
 * 운영 분리 약속에 따라 단일 길드만 허용 — 멤버 동기화·세션 조회·DM 폴백 모두
 * 이 길드 ID 기준. 누락 시 기동 차단.
 */
function getTrpgGuildId(): string {
  const id = process.env.TRPG_GUILD_ID?.trim();
  if (!id) {
    throw new Error("TRPG_GUILD_ID 환경변수가 설정되지 않았습니다.");
  }
  return id;
}

/**
 * DM 발송 실패 시 멘션 폴백할 채널 ID (Phase 2 필수).
 *
 * 운영자가 길드 안의 텍스트 채널 하나를 지정해야 한다. DM 차단 사용자에게
 * `<@userId>` 멘션 + 동일 내용으로 안내.
 */
function getTrpgFallbackChannelId(): string {
  const id = process.env.TRPG_FALLBACK_CHANNEL_ID?.trim();
  if (!id) {
    throw new Error("TRPG_FALLBACK_CHANNEL_ID 환경변수가 설정되지 않았습니다.");
  }
  return id;
}

/** YouTube 음악 기능 사용 시 단일 상태판을 표시할 전용 텍스트 채널 ID. */
function getTrpgMusicChannelId(): string | undefined {
  return process.env.TRPG_MUSIC_CHANNEL_ID?.trim() || undefined;
}

/** 운영 장애 알림 DM을 받을 Discord 사용자 ID (선택). */
function getTrpgAlertUserId(): string | undefined {
  return process.env.TRPG_ALERT_USER_ID?.trim() || undefined;
}

/** 운영 장애를 별도 메시지로 남길 일반 텍스트 채널 ID (선택). */
function getTrpgAlertChannelId(): string | undefined {
  return process.env.TRPG_ALERT_CHANNEL_ID?.trim() || undefined;
}

/**
 * trpg-web 베이스 URL (필수).
 *
 * `/세션확인` 응답 + DM 알림 본문에 첨부할 외부 캘린더 링크 (예: `${base}/calendar`).
 * 스킴이 빠진 값(`dache-calender.vercel.app`)은 모든 링크 버튼을 깨뜨리므로 기동을 막는다.
 */
function getTrpgWebBaseUrl(): string {
  const url = process.env.TRPG_WEB_BASE_URL?.trim();
  if (!url) {
    throw new Error("TRPG_WEB_BASE_URL 환경변수가 설정되지 않았습니다.");
  }
  const reason = invalidHttpUrlReason(url);
  if (reason) {
    throw new Error(
      `TRPG_WEB_BASE_URL 이 올바르지 않습니다: ${reason}. 예: https://dache-calender.vercel.app`,
    );
  }
  return url.replace(/\/+$/, "");
}

/** 생성·수정·취소 알림 폴링 주기(ms). default 60_000 (1분), 허용 10초~10분. */
function getTrpgPollingIntervalMs(): number {
  return readIntervalMs("TRPG_POLLING_INTERVAL_MS", 60_000, {
    min: 10_000,
    max: 10 * 60_000,
  });
}

/**
 * 리마인드 폴링 주기(ms). default 300_000 (5분), 허용 30초~15분.
 *
 * 리마인드 조회 창은 목표 시각 ± 2×주기이므로, 주기가 길면 그만큼 일찍 발송된다.
 */
function getTrpgReminderIntervalMs(): number {
  return readIntervalMs("TRPG_REMINDER_INTERVAL_MS", 300_000, {
    min: 30_000,
    max: 15 * 60_000,
  });
}

/**
 * 시작 1시간 전 리마인드 사용 여부. 기본 활성.
 * `TRPG_REMINDER_1H=0` / `false` / `off` 이면 24시간 전 리마인드만 보낸다.
 */
function isTrpgReminder1hEnabled(): boolean {
  return readBooleanFlag("TRPG_REMINDER_1H", true);
}

/**
 * 음악 재생 경로 일일 자동 점검 사용 여부.
 * `TRPG_MUSIC_HEALTHCHECK=0` / `false` / `off` 이면 비활성.
 */
function isMusicHealthcheckEnabled(): boolean {
  return readBooleanFlag("TRPG_MUSIC_HEALTHCHECK", true);
}

/** 음악 자동 점검 주기(ms). default 86_400_000 (24시간), 허용 10분~7일. */
function getMusicHealthcheckIntervalMs(): number {
  return readIntervalMs("TRPG_MUSIC_HEALTHCHECK_INTERVAL_MS", 86_400_000, {
    min: 10 * 60_000,
    max: 7 * 86_400_000,
  });
}

/** 기동 후 첫 점검까지의 지연(ms). default 60_000 (1분), 허용 0~1시간. */
function getMusicHealthcheckStartDelayMs(): number {
  return readIntervalMs("TRPG_MUSIC_HEALTHCHECK_START_DELAY_MS", 60_000, {
    min: 0,
    max: 60 * 60_000,
  });
}

/**
 * 생존 신호 파일 경로. 봇이 게이트웨이(모든 shard Ready)가 정상일 때 주기적으로 mtime 을
 * 갱신하고, Docker HEALTHCHECK 가 이 파일의 나이를 검사한다. default `/tmp/trpg-bot-heartbeat`.
 */
function getHeartbeatFilePath(): string {
  return process.env.TRPG_HEARTBEAT_FILE?.trim() || "/tmp/trpg-bot-heartbeat";
}

/**
 * 생존 신호 push URL (선택). Uptime Kuma Push·Healthchecks.io 같은 외부 감시가
 * 받을 GET 주소. 형식이 틀리면 경고 후 push 만 끈다(봇 기동은 계속).
 */
function getHeartbeatPushUrl(): string | undefined {
  const url = process.env.TRPG_HEARTBEAT_URL?.trim();
  if (!url) return undefined;
  const reason = invalidHttpUrlReason(url);
  if (reason) {
    console.warn(
      `[config] TRPG_HEARTBEAT_URL 이 올바르지 않아 외부 생존 신호를 끕니다: ${reason}`,
    );
    return undefined;
  }
  return url;
}

/**
 * 자동 점검에 사용할 YouTube 영상 URL.
 *
 * 삭제·지역 차단된 영상을 두면 점검이 항상 실패하므로 오래 유지되는 공개 영상을
 * 기본값으로 둔다. 점검 실패 알림에는 실패 단계가 함께 실리므로 "영상 없음" 과
 * "403 차단" 은 알림 본문에서 구분된다.
 */
function getMusicHealthcheckVideoUrl(): string {
  const url = process.env.TRPG_MUSIC_HEALTHCHECK_VIDEO_URL?.trim();
  return url || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
}

/**
 * `/세션확인` 월간 캘린더 PNG(Puppeteer) 생성 여부.
 * `RESULT_CARD_IMAGE=0` / `false` / `off` 이면 비활성(임베드만 전송).
 */
export function isResultCardImageEnabled(): boolean {
  return readBooleanFlag("RESULT_CARD_IMAGE", true);
}

/** 검증된 환경 설정 객체 */
export const config = {
  discordToken: getDiscordToken(),
  discordClientId: getDiscordClientId(),
  mongoUri: getMongoUri(),
  mongoDbName: getMongoDbName(),
  guildId: getGuildId(),
  trpgGuildId: getTrpgGuildId(),
  trpgFallbackChannelId: getTrpgFallbackChannelId(),
  trpgMusicChannelId: getTrpgMusicChannelId(),
  trpgAlertUserId: getTrpgAlertUserId(),
  trpgAlertChannelId: getTrpgAlertChannelId(),
  trpgWebBaseUrl: getTrpgWebBaseUrl(),
  trpgPollingIntervalMs: getTrpgPollingIntervalMs(),
  trpgReminderIntervalMs: getTrpgReminderIntervalMs(),
  trpgReminder1hEnabled: isTrpgReminder1hEnabled(),
  musicHealthcheckEnabled: isMusicHealthcheckEnabled(),
  musicHealthcheckIntervalMs: getMusicHealthcheckIntervalMs(),
  musicHealthcheckStartDelayMs: getMusicHealthcheckStartDelayMs(),
  musicHealthcheckVideoUrl: getMusicHealthcheckVideoUrl(),
  heartbeatFilePath: getHeartbeatFilePath(),
  heartbeatPushUrl: getHeartbeatPushUrl(),
} as const;
