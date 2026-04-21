/**
 * PM2 ecosystem config — OCI Compute VM 등 실배포 환경에서 사용한다.
 *
 * 로컬 개발에는 사용하지 말 것.
 * 각 봇의 로컬 실행은 해당 패키지의 `pnpm start` 또는 `npm start` 를 사용.
 *
 * 사용법 (서버 안, 저장소 루트에서):
 *   pm2 start deploy/pm2/ecosystem.config.cjs
 *   pm2 reload deploy/pm2/ecosystem.config.cjs --update-env
 *
 * 배포 전 준비 (패키지 매니저가 봇마다 다름):
 *   - registra-bot (pnpm workspace 멤버):
 *       저장소 루트에서
 *         pnpm install
 *         pnpm --filter @stargate/shared-db build
 *         cd registra-bot && pnpm run build
 *   - trpg-bot (독립 npm 패키지, 워크스페이스 외부):
 *       cd trpg-bot && npm ci && npm run build
 *
 *   두 봇은 서로 다른 패키지 매니저를 사용한다
 *   (registra-bot = pnpm workspace, trpg-bot = 독립 npm).
 *   각 봇 디렉토리에 `.env` 파일이 있어야 한다 (DISCORD_TOKEN, MONGODB_URI 등).
 *
 * 상세 가이드: docs/OCI_COMPUTE_PM2_MULTI_BOT_DEPLOYMENT.md
 */

const fs = require("node:fs");
const path = require("node:path");

/** 저장소 루트 (이 파일 기준 2단계 상위) */
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const registraCwd = path.join(REPO_ROOT, "registra-bot");
const trpgCwd = path.join(REPO_ROOT, "trpg-bot");

// 로그 디렉토리 선행 생성 — PM2가 out_file/error_file 경로를 열 때 디렉토리가
// 없으면 실패하므로 config 로드 시점에 보장한다.
fs.mkdirSync(path.join(registraCwd, "logs"), { recursive: true });
fs.mkdirSync(path.join(trpgCwd, "logs"), { recursive: true });

module.exports = {
  apps: [
    {
      name: "registra-bot",
      cwd: registraCwd,
      script: "dist/index.js",
      // package.json "type": "module" 이므로 ESM 모드로 기동
      node_args: "--enable-source-maps",
      // Discord 봇은 단일 gateway 연결만 유지해야 하므로 fork 모드 고정 (cluster 금지)
      instances: 1,
      exec_mode: "fork",
      env_file: path.join(registraCwd, ".env"),
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_memory_restart: "512M",
      out_file: path.join(registraCwd, "logs", "out.log"),
      error_file: path.join(registraCwd, "logs", "error.log"),
      merge_logs: true,
      time: true,
    },
    {
      name: "trpg-bot",
      cwd: trpgCwd,
      script: "dist/index.js",
      node_args: "--enable-source-maps",
      // Discord 봇은 단일 gateway 연결만 유지해야 하므로 fork 모드 고정 (cluster 금지)
      instances: 1,
      exec_mode: "fork",
      env_file: path.join(trpgCwd, ".env"),
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_memory_restart: "512M",
      out_file: path.join(trpgCwd, "logs", "out.log"),
      error_file: path.join(trpgCwd, "logs", "error.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
