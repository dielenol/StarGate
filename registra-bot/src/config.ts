/**
 * 환경변수 검증 및 내보내기
 *
 * 봇 실행에 필요한 DISCORD_TOKEN, DISCORD_CLIENT_ID, MONGODB_URI를
 * process.env에서 읽어 검증 후 반환합니다.
 * @module config
 */

import "dotenv/config";
import { ConfigErr } from "./constants/registrar-voice.js";

/** 환경변수에서 Discord 봇 토큰을 읽어 반환합니다. */
function getDiscordToken(): string {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error(ConfigErr.token);
  }
  return token;
}

/** 환경변수에서 Discord Application (Client) ID를 읽어 반환합니다. */
function getDiscordClientId(): string {
  const id = process.env.DISCORD_CLIENT_ID;
  if (!id) {
    throw new Error(ConfigErr.clientId);
  }
  return id;
}

/** 환경변수에서 MongoDB 연결 문자열을 읽어 반환합니다. */
function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(ConfigErr.mongo);
  }
  return uri;
}

/** 개발용: 특정 길드에만 커맨드를 등록할 때 사용 (선택) */
function getGuildId(): string | undefined {
  return process.env.GUILD_ID;
}

/**
 * 선택: 이 Role ID를 보유한 멤버는 서버 관리 권한이 없어도 `/일정` 계열을 사용할 수 있음.
 * 미설정 시 기존과 동일하게 `Administrator`/`ManageGuild` 비트만 통과.
 */
function getMiniSessionMasterRoleId(): string | undefined {
  const v = process.env.MINI_SESSION_MASTER_ROLE_ID?.trim();
  return v && v.length > 0 ? v : undefined;
}

/** MongoDB 데이터베이스 이름 (미설정 시 stargate 통합 DB) */
function getMongoDbName(): string {
  const n = process.env.MONGODB_DB_NAME?.trim();
  return n && n.length > 0 ? n : "stargate";
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
  mongoDbName: getMongoDbName(),
  miniSessionMasterRoleId: getMiniSessionMasterRoleId(),
} as const;
