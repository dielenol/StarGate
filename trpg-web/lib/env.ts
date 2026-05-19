/**
 * 필수 환경변수 헬퍼 + 부팅 시 사전 검증.
 *
 * 누락 시 명시적 throw 로 모듈 로드 시점에 실패를 강제한다.
 * (개별 라우트 진입 시점이 아니라 앱 부팅 시점에 missing 을 드러내기 위함.)
 *
 * 주의:
 * - next-auth 는 `NEXTAUTH_SECRET` / `AUTH_SECRET` 둘 다 인식하지만 본 모듈은
 *   표준인 `AUTH_SECRET` 만 강제 검증한다.
 * - `SKIP_ENV_VALIDATION=true` 인 경우 (CI/lint/typecheck 환경) eager 검증을
 *   건너뛴다. 런타임 도달 시 헬퍼 호출 지점에서 다시 평가된다.
 */

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }
  return value;
}

function readEnv(name: string): string {
  if (process.env.SKIP_ENV_VALIDATION === "true") {
    return process.env[name] ?? "";
  }
  return getRequiredEnv(name);
}

function readEnvWithFallback(primaryName: string, fallbackName: string): string {
  const primary = process.env[primaryName];
  if (primary && primary.length > 0) return primary;
  return readEnv(fallbackName);
}

// 모듈 로드 시점 검증 — 누락 시 앱 부팅이 즉시 실패한다.
export const MONGODB_URI = readEnv("MONGODB_URI");
export const TRPG_GUILD_ID = readEnv("TRPG_GUILD_ID");
export const DISCORD_CLIENT_ID = readEnvWithFallback(
  "TRPG_DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_ID",
);
export const DISCORD_CLIENT_SECRET = readEnvWithFallback(
  "TRPG_DISCORD_CLIENT_SECRET",
  "DISCORD_CLIENT_SECRET",
);
export const AUTH_SECRET = readEnv("AUTH_SECRET");
