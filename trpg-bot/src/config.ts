/**
 * 환경변수 검증 및 내보내기
 *
 * 봇 실행에 필요한 DISCORD_TOKEN, DISCORD_CLIENT_ID, MONGODB_URI 및
 * Phase 2 신규 추가 변수 (TRPG_GUILD_ID, TRPG_FALLBACK_CHANNEL_ID,
 * TRPG_WEB_BASE_URL, polling/reminder interval) 를 process.env 에서 읽어
 * 검증 후 반환합니다.
 *
 * @module config
 */

import "dotenv/config";

/** 로컬 주사위 테스트 전용 모드. DB/스케줄러 없이 `/roll`, `/r`만 켠다. */
function isDiceOnlyMode(): boolean {
  const v = (process.env.TRPG_BOT_DICE_ONLY ?? process.env.DICE_ONLY)
    ?.trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on";
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
function getMongoUri(required: boolean): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    if (!required) return "";
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
function getTrpgFallbackChannelId(required: boolean): string {
  const id = process.env.TRPG_FALLBACK_CHANNEL_ID?.trim();
  if (!id) {
    if (!required) return "";
    throw new Error("TRPG_FALLBACK_CHANNEL_ID 환경변수가 설정되지 않았습니다.");
  }
  return id;
}

/**
 * trpg-web 베이스 URL (Phase 2 필수).
 *
 * `/세션확인` 응답 + DM 알림 본문에 첨부할 외부 캘린더 링크 (예: `${base}/calendar`).
 */
function getTrpgWebBaseUrl(required: boolean): string {
  const url = process.env.TRPG_WEB_BASE_URL?.trim();
  if (!url) {
    if (!required) return "";
    throw new Error("TRPG_WEB_BASE_URL 환경변수가 설정되지 않았습니다.");
  }
  return url.replace(/\/+$/, "");
}

/** 생성 알림 폴링 주기(ms). default 60_000 (1분). */
function getTrpgPollingIntervalMs(): number {
  const v = process.env.TRPG_POLLING_INTERVAL_MS?.trim();
  if (!v) return 60_000;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 60_000;
  return Math.floor(n);
}

/** 24h 리마인드 폴링 주기(ms). default 300_000 (5분). */
function getTrpgReminderIntervalMs(): number {
  const v = process.env.TRPG_REMINDER_INTERVAL_MS?.trim();
  if (!v) return 300_000;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 300_000;
  return Math.floor(n);
}

/**
 * 마감 시 결과 카드 PNG 첨부(Puppeteer) 사용 여부.
 * `RESULT_CARD_IMAGE=0` / `false` / `off` 이면 비활성(임베드만 전송).
 */
export function isResultCardImageEnabled(): boolean {
  const v = process.env.RESULT_CARD_IMAGE?.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

/** 검증된 환경 설정 객체 */
const diceOnly = isDiceOnlyMode();

export const config = {
  diceOnly,
  discordToken: getDiscordToken(),
  discordClientId: getDiscordClientId(),
  mongoUri: getMongoUri(!diceOnly),
  mongoDbName: getMongoDbName(),
  guildId: getGuildId(),
  trpgGuildId: getTrpgGuildId(),
  trpgFallbackChannelId: getTrpgFallbackChannelId(!diceOnly),
  trpgWebBaseUrl: getTrpgWebBaseUrl(!diceOnly),
  trpgPollingIntervalMs: getTrpgPollingIntervalMs(),
  trpgReminderIntervalMs: getTrpgReminderIntervalMs(),
} as const;
