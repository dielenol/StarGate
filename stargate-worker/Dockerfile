# Dokploy build context: repository root (/)
# Dockerfile path: stargate-worker/Dockerfile

FROM node:22-bookworm-slim AS builder

RUN corepack enable
WORKDIR /repo

COPY .dockerignore package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/shared-db/package.json ./packages/shared-db/
COPY stargate-worker/package.json ./stargate-worker/
COPY scripts/clean-package-dist.mjs ./scripts/clean-package-dist.mjs

RUN pnpm install --frozen-lockfile --filter=stargate-worker...

COPY packages/core ./packages/core
COPY packages/shared-db ./packages/shared-db
COPY stargate-worker ./stargate-worker

RUN pnpm --filter=@stargate/shared-db build \
 && pnpm --filter=@stargate/core build \
 && pnpm --filter=stargate-worker build \
 && node stargate-worker/source-revision.mjs > stargate-worker/dist/source-revision

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    TZ=Asia/Seoul \
    WORKER_MODE=shadow \
    WORKER_PORT=3001

RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/shared-db/package.json ./packages/shared-db/
COPY stargate-worker/package.json ./stargate-worker/

RUN pnpm install --frozen-lockfile --prod --filter=stargate-worker...

COPY --from=builder /repo/packages/core/dist ./packages/core/dist
COPY --from=builder /repo/packages/shared-db/dist ./packages/shared-db/dist
COPY --from=builder /repo/stargate-worker/dist ./stargate-worker/dist

RUN chown -R node:node /repo
USER node

WORKDIR /repo/stargate-worker
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.WORKER_PORT || 3001}/healthz`).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
