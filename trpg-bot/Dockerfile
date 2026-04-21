# syntax=docker/dockerfile:1.7
#
# trpg-bot production image
# ------------------------------------------------------------
# - pnpm workspace 외부 — 빌드 컨텍스트는 **trpg-bot/** 디렉토리
#   Dokploy build context = "trpg-bot" , Dockerfile path = "trpg-bot/Dockerfile"
# - package-lock.json 존재하므로 npm ci 사용 (재현 가능 빌드)
# ============================================================

# ========= Stage 1: builder =========
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ========= Stage 2: runner =========
FROM node:22-bookworm-slim AS runner

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
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    TZ=Asia/Seoul

WORKDIR /app

# 프로덕션 의존성만 재설치
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 빌드 산출물만 복사
COPY --from=builder /app/dist ./dist

# 비루트 사용자
RUN groupadd --system --gid 1001 bot \
 && useradd --system --uid 1001 --gid bot --home /app bot \
 && chown -R bot:bot /app
USER bot

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
