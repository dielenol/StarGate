# syntax=docker/dockerfile:1.7
#
# trpg-bot production image
# ------------------------------------------------------------
# - pnpm workspace 멤버이므로 빌드 컨텍스트는 **레포 루트** 사용
#   Dokploy build context = "/" , Dockerfile path = "trpg-bot/Dockerfile"
# - Stage 0 (pot)     : bgutil POT provider 공식 이미지 (빌드 산출물만 가져온다)
# - Stage 1 (builder) : shared-db + trpg-bot 를 빌드
# - Stage 2 (runner)  : 런타임 의존성만 깐 Debian slim + Chromium
# ============================================================

# POT provider 버전 — pip 플러그인과 provider 서버 이미지가 같은 값을 쓴다.
ARG BGUTIL_POT_PROVIDER_VERSION=1.3.1

# ========= Stage 0: POT provider =========
FROM brainicism/bgutil-ytdlp-pot-provider:${BGUTIL_POT_PROVIDER_VERSION} AS pot

# ========= Stage 1: builder =========
FROM node:22-bookworm-slim AS builder

RUN corepack enable

# 런타임은 시스템 Chromium 을 쓰므로 빌드 단계에서 Chrome 을 내려받지 않는다.
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /repo

# 1) manifests만 먼저 복사 — 레이어 캐싱 최대화
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-db/package.json ./packages/shared-db/
COPY trpg-bot/package.json ./trpg-bot/

# 2) trpg-bot + shared-db 및 의존성 전체 설치
RUN pnpm install --frozen-lockfile \
    --filter=@stargate/shared-db... \
    --filter=trpg-discord-bot...

# 3) 소스 복사 후 빌드 (trpg-bot build 는 이전 dist 를 지우는 공용 스크립트를 쓴다)
COPY scripts/clean-package-dist.mjs ./scripts/
COPY packages/shared-db ./packages/shared-db
COPY trpg-bot ./trpg-bot

RUN pnpm --filter=@stargate/shared-db build \
 && pnpm --filter=trpg-discord-bot build

# ========= Stage 2: runner =========
FROM node:22-bookworm-slim AS runner

# YouTube가 player client를 조일 때마다 stable 릴리스는 수 주 뒤처진다. 기본
# 클라이언트가 막히면 googlevideo가 미디어 URL을 403으로 거부하므로 nightly 채널을
# 고정 버전으로 사용한다. 재생이 403으로 깨지면 이 값을 최신 nightly로 올려 재빌드.
# 목록: https://pypi.org/project/yt-dlp/#history
ARG YT_DLP_VERSION=2026.8.18.122307.dev0
# POT provider 플러그인. 토큰은 같은 컨테이너에서 docker-entrypoint.sh 가 띄우는
# provider 서버(127.0.0.1:4416)가 만든다 (README "YouTube 403 대응" 참조).
ARG BGUTIL_POT_PROVIDER_VERSION

RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        ffmpeg \
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
        python3 \
        python3-pip \
        libexpat1 \
        curl \
    && python3 -m pip install --break-system-packages --no-cache-dir --pre \
        "yt-dlp[default]==${YT_DLP_VERSION}" \
        "bgutil-ytdlp-pot-provider==${BGUTIL_POT_PROVIDER_VERSION}" \
    && yt-dlp --version \
    && ffmpeg -version \
    && rm -rf /var/lib/apt/lists/*

# POT provider 는 소스 빌드 시 canvas 네이티브 컴파일이 필요하므로 공식 이미지의
# 빌드 산출물을 그대로 복사한다. canvas 는 napi 바인딩 + 자체 번들 .so 라서
# 이미지의 Node 25 와 여기의 Node 22 사이에서 그대로 동작한다 (2026-08-18 실측).
COPY --from=pot --chown=1001:1001 /app /opt/pot-provider

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    TZ=Asia/Seoul \
    YT_DLP_POT_PROVIDER_URL=http://127.0.0.1:4416 \
    TRPG_HEARTBEAT_FILE=/tmp/trpg-bot-heartbeat

RUN corepack enable

# 비루트 사용자. HOME(/repo)만 쓰기 가능하게 두고(yt-dlp 캐시 등), 의존성·빌드
# 산출물은 root 소유 그대로 읽기 전용으로 쓴다 — 재귀 chown 으로 node_modules
# 레이어가 한 번 더 복제되는 것을 피한다.
RUN groupadd --system --gid 1001 bot \
 && useradd --system --uid 1001 --gid bot --home /repo bot \
 && mkdir -p /repo \
 && chown bot:bot /repo

WORKDIR /repo

# 프로덕션 의존성만 재설치 (devDependencies 제외)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-db/package.json ./packages/shared-db/
COPY trpg-bot/package.json ./trpg-bot/

RUN pnpm install --frozen-lockfile --prod \
    --filter=@stargate/shared-db... \
    --filter=trpg-discord-bot...

# 빌드 산출물만 복사
COPY --from=builder /repo/packages/shared-db/dist ./packages/shared-db/dist
COPY --from=builder /repo/trpg-bot/dist ./trpg-bot/dist

COPY --chmod=755 trpg-bot/docker-entrypoint.sh /usr/local/bin/trpg-bot-start

USER bot

WORKDIR /repo/trpg-bot

# 봇은 게이트웨이(모든 shard Ready)가 정상일 때만 60초마다 생존 신호 파일을 갱신한다.
# DB 장애는 조건이 아니다(재시작으로 고칠 수 없고 음악·주사위까지 끊긴다 — `/상태` 로 본다).
# 3분 넘게 갱신이 없으면 unhealthy — 프로세스는 살아 있지만 게이트웨이가 끊긴 상태를 잡는다.
HEALTHCHECK --interval=60s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "const f=process.env.TRPG_HEARTBEAT_FILE||'/tmp/trpg-bot-heartbeat';try{process.exit(Date.now()-require('fs').statSync(f).mtimeMs<180000?0:1)}catch{process.exit(1)}"

ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/trpg-bot-start"]
