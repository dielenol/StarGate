# syntax=docker/dockerfile:1.7
#
# registra-bot production image
# ------------------------------------------------------------
# - pnpm workspace 멤버이므로 빌드 컨텍스트는 **레포 루트** 사용
#   Dokploy build context = "/" , Dockerfile path = "registra-bot/Dockerfile"
# - Stage 1 (builder) : shared-db + registra-bot 를 빌드
# - Stage 2 (runner)  : 런타임 의존성만 깐 Debian slim + Chromium
# ============================================================

# ========= Stage 1: builder =========
FROM node:22-bookworm-slim AS builder

RUN corepack enable

WORKDIR /repo

# 1) manifests만 먼저 복사 — 레이어 캐싱 최대화
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-db/package.json ./packages/shared-db/
COPY registra-bot/package.json ./registra-bot/

# 2) registrar-bot + shared-db 및 의존성 전체 설치 (StarGateV2 제외)
RUN pnpm install --frozen-lockfile \
    --filter=@stargate/shared-db... \
    --filter=registrar-bot...

# 3) 소스 복사 후 빌드
COPY packages/shared-db ./packages/shared-db
COPY registra-bot ./registra-bot

RUN pnpm --filter=@stargate/shared-db build \
 && pnpm --filter=registrar-bot build

# ========= Stage 2: runner =========
FROM node:22-bookworm-slim AS runner

# Puppeteer용 시스템 Chromium + 한글 폰트 + 좀비 프로세스 차단용 dumb-init
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        fonts-noto-cjk \
        fonts-liberation \
        libnss3 \
        libatk-bridge2.0-0 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        libgbm1 \
        libasound2 \
        dumb-init \
        tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    TZ=Asia/Seoul

RUN corepack enable

WORKDIR /repo

# 프로덕션 의존성만 재설치 (devDependencies 제외)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-db/package.json ./packages/shared-db/
COPY registra-bot/package.json ./registra-bot/

RUN pnpm install --frozen-lockfile --prod \
    --filter=@stargate/shared-db... \
    --filter=registrar-bot...

# 빌드 산출물만 복사
COPY --from=builder /repo/packages/shared-db/dist ./packages/shared-db/dist
COPY --from=builder /repo/registra-bot/dist ./registra-bot/dist

# 비루트 사용자로 실행
RUN groupadd --system --gid 1001 bot \
 && useradd --system --uid 1001 --gid bot --home /repo bot \
 && chown -R bot:bot /repo
USER bot

WORKDIR /repo/registra-bot

# dumb-init = PID 1 시그널 핸들러 (SIGTERM → Chromium 자식까지 정리)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
