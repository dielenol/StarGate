/**
 * 환경변수 검증 및 내보내기
 *
 * 봇 실행에 필요한 DISCORD_TOKEN, DISCORD_CLIENT_ID, MONGODB_URI를
 * process.env에서 읽어 검증 후 반환합니다.
 * @module config
 */

import "dotenv/config";

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

/** 개발용: 특정 길드에만 커맨드를 등록할 때 사용 (선택) */
function getGuildId(): string | undefined {
  return process.env.GUILD_ID;
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
export const config = {
  discordToken: getDiscordToken(),
  discordClientId: getDiscordClientId(),
  mongoUri: getMongoUri(),
  guildId: getGuildId(),
} as const;
