/**
 * 테스트 공통 환경변수 스텁.
 *
 * `src/config.ts` 는 import 시점에 필수 값을 검증하므로, config 를 불러오는 dist
 * 모듈을 동적 import 하기 전에 `applyTestEnv()` 를 호출한다. 로컬 `trpg-bot/.env`
 * 는 package.json `test` 스크립트의 `DOTENV_CONFIG_PATH=/dev/null` 로 읽지 않는다.
 *
 * @param {Record<string, string>} [overrides] 테스트별로 강제할 값
 */
export function applyTestEnv(overrides = {}) {
  const defaults = {
    DISCORD_TOKEN: "test-token",
    DISCORD_CLIENT_ID: "test-client-id",
    MONGODB_URI: "mongodb://localhost:27017/test",
    TRPG_GUILD_ID: "test-guild-id",
    TRPG_FALLBACK_CHANNEL_ID: "test-channel-id",
    TRPG_MUSIC_CHANNEL_ID: "test-music-channel-id",
    TRPG_WEB_BASE_URL: "https://example.test",
  };
  for (const [key, value] of Object.entries(defaults)) {
    process.env[key] ||= value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}
