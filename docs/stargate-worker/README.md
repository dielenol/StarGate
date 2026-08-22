# StarGate 장기 실행 런타임 통합

## 목표

`StarGateV2`의 요청/응답 경계를 유지하면서 Vercel에 맞지 않는 예약 실행, durable 외부 전달, MongoDB Change Stream, ERP WebSocket을 `stargate-worker`로 단계적으로 옮긴다.

```mermaid
flowchart LR
    Browser["ERP 브라우저"] --> Web["StarGateV2 / Vercel"]
    Discord["Discord 사용자"] --> Registra["registra-bot"]
    Web --> Mongo["MongoDB Atlas"]
    Registra --> Mongo
    Mongo --> Worker["stargate-worker / Dokploy"]
    Schedule["Dokploy Schedule"] --> Worker
    Worker --> External["Discord REST / Webhook"]
    Worker -->|"WSS invalidate"| Browser
```

## 런타임 책임

| 런타임 | 책임 | 이관하지 않는 것 |
|---|---|---|
| `StarGateV2` | UI, Auth.js, RBAC, 사용자 요청 mutation, 경제 transaction, outbox enqueue | 장기 polling, 비대화형 Discord 전송 |
| `stargate-worker` | 예약 작업, outbox/desired-state drain, Change Stream, `/erp` WebSocket | 세션 쿠키 판정, 사용자 요청 mutation, Discord Gateway |
| `registra-bot` | Gateway, slash/button/autocomplete, 길드 캐시, 자동 마감, Puppeteer 결과 카드 | ERP 알림 생성, 범용 비대화형 webhook |
| `@stargate/shared-db` | Mongo 타입/공용 CRUD, transaction, durable claim/lease, index 정의 | HTTP, Socket.IO, Discord 전송 |
| `@stargate/core` | 런타임 중립 도메인 규칙과 서버 operation | React, Next.js, Discord Gateway |

`trpg-bot`과 `trpg-web`은 이관 대상이 아니지만 `@stargate/shared-db` 변경 시 호환 빌드·배포 판단에 포함한다.

## 현재 구현 상태

| 항목 | 상태 | 안전 경계 |
|---|---|---|
| `@stargate/core` | 구현 | 주식·편의점·연구 규칙과 네 예약 operation, 실시간 계약 |
| Node 22 ESM worker/Docker | 구현 | Chromium 없음, 비루트 `node` 사용자 |
| `/healthz`, `/readyz` | 구현 | ready는 Mongo·consumer·Change Stream이 모두 준비된 경우만 200 |
| graceful shutdown | 구현 | SIGTERM/SIGINT에서 Change Stream → consumer → Mongo → HTTP 순서로 종료 |
| Socket.IO `/erp` | 구현 | WebSocket-only, origin allowlist, HS256 ticket, payload·전체/사용자 연결 수 제한 |
| Change Stream mapper | 구현 | whitelist 컬렉션을 Query resource로만 변환하며 DB 값/PII를 보내지 않음 |
| Change Stream checkpoint | 구현 | `worker_checkpoints` persistent adapter가 기본, 손상 token은 폐기 후 전체 invalidate |
| shadow consumer | 구현 | due 수만 읽고 claim·외부 전송·경제 mutation은 하지 않음 |
| active 예약 job | 구현 | 네 CLI, slot lease heartbeat/token fencing, 최종 시도 crash DEAD 회수 |
| active 범용 outbox | 구현 | 전체 kind fail-fast 등록, 지수 backoff, 최대 8회 및 만료 lease DEAD 회수, 실제 발송/정책 생략 결과 분리 |
| active desired-state/아메리 | 구현 | production 전체 consumer fail-fast, 밀린 DM 최신 단계 수렴, 카드 create-before-retire 교체 |
| 운영 heartbeat/연동 경보 | 구현 | 활성 consumer/kind와 지연·DEAD·lease·봇 위임 오류를 감시하고 incident/cooldown을 MongoDB에 영속화 |
| ERP realtime client | 구현 | `off/observe/primary`, 연결 상태별 polling fallback, 100ms Query batch, 알림 toast |
| Registra finalization | 구현 | 불변 trigger/operation key, lease/token/nonce, `DELIVERY_UNKNOWN`·legacy 격리로 자동 중복 발송 차단 |
| legacy `tia_bot` | 제거 | 코드·이미지만 삭제, 과거 문서 archive, Mongo 데이터 유지 |
| Dokploy webhook workflow | 구현 | `main`의 worker 영향 경로는 자동 배포, 초기 shadow 배포는 수동 확인 뒤 호출 |

코드 기본값은 `WORKER_MODE=shadow`다. shadow도 Change Stream 재시작을 위해 `worker_checkpoints`와 secret 없는 `worker_runtime_status` heartbeat만 기록하며 경제 상태, queue 상태, 외부 전달은 변경하지 않는다. 실제 배포 모드는 Dokploy 환경 설정을 따른다. production active는 누락 drift를 막기 위해 상시 consumer와 범용 outbox를 각각 `WORKER_CONSUMERS=all`, `WORKER_OUTBOX_KINDS=all`로 설정해야 기동한다.

초기 shadow 검증을 마친 뒤에는 `main`에 `stargate-worker/**`, `packages/core/**`, `packages/shared-db/**` 또는 관련 workspace·workflow 파일이 변경되면 GitHub Actions가 Dokploy worker webhook을 자동 호출한다. 배포 모드는 저장소가 아니라 Dokploy의 `WORKER_MODE` 설정을 그대로 따른다.

## 패키지 구조

```text
packages/core/
  src/domain/         주식·편의점·연구·시간·realtime 계약
  src/operations/     예약 경제/재고/ERP 알림 operation

stargate-worker/
  src/cli/             Dokploy Application Job 진입점
  src/consumers/       아메리/연구/입고/공시 polling과 shadow probe
  src/jobs/            예약 job dispatcher와 durable run coordinator
  src/outbox/          범용 integration_outbox consumer와 Discord adapter
  src/realtime/        ticket, Change Stream, resource mapper, Socket.IO
  src/health/          health/readiness HTTP
  src/adapters/        shared-db 연결 adapter
```

## 예약 명령

Dokploy Application Job은 동일 이미지에서 다음 명령을 실행한다.

| 작업 | KST | 명령 |
|---|---:|---|
| 편의점 재고 | 매일 11:00 | `node dist/cli/run-job.js shop.refresh` |
| NOVEX 주식 회차 | 매일 09:00·13:00·18:00·23:00 | `node dist/cli/run-job.js stocks.tick` |
| 일일 수당 | 매일 12:00 | `node dist/cli/run-job.js credits.daily-allowance` |
| ERP 세션 알림 | 매일 21:00 | `node dist/cli/run-job.js sessions.erp-reminders` |

외부 job 실행 HTTP API는 만들지 않는다. 동일 `(jobName, slotKey)` 실행권은 `scheduled_job_runs` unique/lease가 보장하고 장기 handler는 heartbeat로 lease를 갱신한다. 최종 attempt에서 프로세스가 종료돼도 active sweeper가 만료 lease를 `DEAD`로 전환한다. `stocks.tick`의 `slotKey`는 KST `YYYY-MM-DD HH:mm`, 나머지 일일 job은 기존 `YYYY-MM-DD`를 유지한다. 네 job은 각각 편의점 품목별 날짜 조건, 주식 회차·ticker별 operation key와 transaction, 수당 캐릭터별 일자 ledger, ERP 알림 `dedupeKey`를 추가 불변 조건으로 사용한다.

### NOVEX 2.0 주식 엔진

- `NOVEX_V2_MODE=disabled|shadow|enabled`가 전환 SSOT다. 기본값은 `disabled`이며 `shadow`는 기존 가격 엔진을 계속 확정하면서 NOVEX 가격·수급·공시 계산만 읽기 전용으로 비교한다.
- `enabled`에서 09시 회차가 성공해야 개장한다. 거래 시간은 KST 09:00 이상 23:00 미만이고, 23시 회차 실패와 무관하게 시간 경계에서 폐장한다.
- 13·18시 지연은 직전 가격으로 거래를 유지하고, 다음 회차 전 재시도한다. 오래된 회차는 다음 성공 회차의 `mergedSlotKeys`에 병합한다.
- `2026-08-23`을 기준으로 격주 일요일의 `노부스 오르도 - 정규 세션` 일정 하나를 조기 폐장 시각으로 사용한다. 일정이 없거나 복수면 운영 경고를 남기고 18시에 폐장하며, GM 날짜 예외가 우선한다.
- 조기 폐장 뒤 남은 수급·공시·회차는 월요일 09시에 합치고 일요일 23시 Discord 종가 장부는 갱신하지 않는다.
- 정상 Discord 장부는 09·13·18·23시 각 회차의 desired-state를 갱신한다. 충격 공시와 수동 정지·재개는 종목별 durable outbox로 처리하고, 자동 냉각·해제는 같은 회차의 대상 종목을 각각 한 공시로 묶어 처리한다.
- `/api/cron/stocks/tick`은 `CRON_SECRET`으로 인증된 수동 복구 경로일 뿐 자동 실행 owner가 아니다.

## 실시간 계약

StarGateV2가 활성 Auth.js 세션을 검증한 뒤 최대 60초 HS256 ticket을 발급한다. worker는 issuer, audience, `version=1`, `status=ACTIVE`, `sub`, `role`, `iat`, `exp`를 handshake에서 검증한다. 60초는 연결 수명이 아니라 handshake 유효기간이다. 정상 role/status 변경은 해당 사용자를 끊고, Change Stream gap은 connection generation을 올려 active socket과 검증 중인 pending handshake를 모두 폐기한다.

서버 이벤트는 두 종류다.

```ts
type RealtimeInvalidateV1 = {
  version: 1;
  id: string;
  type: "invalidate";
  resources: RealtimeResource[];
  emittedAt: string;
};

type RealtimeSessionRefreshV1 = {
  version: 1;
  id: string;
  type: "session-refresh";
  reason: "identity-changed";
  emittedAt: string;
};
```

payload에는 사용자 ID, 이름, 크레딧, 수량, 문서 본문을 넣지 않는다. 브라우저는 resource에 대응하는 TanStack Query를 invalidate/refetch한다. 알림과 플레이어 거래는 Change Stream `fullDocument`에서 worker 내부 라우팅용 사용자 ID만 추출해 대상 socket에만 같은 공개 event를 보내며, 삭제나 라우팅 불명 변경은 전체 invalidate로 안전하게 폴백한다.

`users.role` 또는 `users.status` 변경은 해당 사용자에게 `session-refresh`를 보낸 뒤 socket과 검증 중 handshake를 폐기한다. 브라우저는 현재 세션과 route를 다시 검증하며 비활성 계정은 로그인 경계로 이동한다.

StarGateV2의 `REALTIME_CLIENT_MODE`는 다음 세 단계다.

| 값 | 동작 |
|---|---|
| `off` | WebSocket을 열지 않고 polling fallback을 유지 |
| `observe` | WebSocket invalidation과 polling을 함께 사용해 결과 비교 |
| `primary` | 연결 중 전환 대상 polling을 중지하고 장애 중에만 재개 |

연결 상태는 `connecting`, `connected`, `degraded`, `disabled`로 제공한다. disconnect와 reconnect 때 active Query 전체를 각각 한 번 재검증하고, 평상시 event는 100ms 동안 resource와 Query root를 합쳐 같은 root를 한 번만 refetch한다. event ID는 최근 256개까지만 보관해 중복 전달을 무시한다.

## 환경변수

실제 값은 저장소에 기록하지 않는다. 전체 목록은 [`stargate-worker/.env.example`](../../stargate-worker/.env.example)을 따른다.

- worker: `WORKER_MODE`, `NOVEX_V2_MODE=disabled|shadow|enabled`, `WORKER_REPLICA_COUNT=1`, `WORKER_HOST`, `WORKER_PORT`, `WORKER_POLL_INTERVAL_MS`, `WORKER_CONSUMERS=all`, `WORKER_CONSUMERS_ALLOW_PARTIAL=false`, `WORKER_OUTBOX_KINDS=all`, `WORKER_OUTBOX_ALLOW_PARTIAL=false`
- MongoDB: `MONGODB_URI`, `MONGODB_DB_NAME`, `MONGODB_MAX_POOL_SIZE`
- realtime: `REALTIME_TICKET_SECRET`, `REALTIME_TICKET_ISSUER`, `REALTIME_TICKET_AUDIENCE`, `REALTIME_ALLOWED_ORIGINS`, `REALTIME_MAX_PAYLOAD_BYTES`, `REALTIME_MAX_CONNECTIONS`, `REALTIME_MAX_CONNECTIONS_PER_USER`
- web realtime client: `REALTIME_CLIENT_MODE=off|observe|primary`
- delivery: `AMERI_DISCORD_BOT_TOKEN`, `REGISTRAR_DISCORD_BOT_TOKEN`, `DISCORD_WEBHOOK_AUDIT_URL`, `DISCORD_WEBHOOK_WORKFLOW_URL`, `DISCORD_WEBHOOK_OPS_URL`, `DISCORD_WEBHOOK_SHOP_URL`, `DISCORD_WEBHOOK_STOCK_URL`, `DISCORD_WEBHOOK_RESEARCH_URL`, `NEXT_PUBLIC_SITE_URL`

`REALTIME_TICKET_SECRET`은 StarGateV2의 ticket 발급 환경과 동일한 최소 32바이트 secret이어야 한다. 값을 로그, CI 출력, 문서에 남기지 않는다.

`WORKER_CONSUMERS`는 `ameri-dm`, `research-card`, `shop-restock`, `stock-market-wire`를 활성화한다. production active는 `all` 또는 네 이름 전부를 요구하며, 누락되면 claim 전에 기동을 거부한다. 제한된 staging 순차 검증만 `WORKER_CONSUMERS_ALLOW_PARTIAL=true`와 명시 목록을 함께 사용할 수 있다. 관리자 연동 현황과 운영 경보는 기대 목록 대비 누락 consumer를 장애로 표시한다.

`WORKER_OUTBOX_KINDS`는 active에서 `all`을 사용한다. 지원 값은 `GM_ADMIN_AUDIT`, `CHARACTER_EDIT_WEBHOOK`, `EQUIPMENT_WORKSHOP_WEBHOOK`, `SHOP_REORDER_REQUEST_WEBHOOK`, `SHOP_REORDER_FULFILLED_WEBHOOK`, `SHOP_PRODUCT_LAUNCH_WEBHOOK`, `MRBEAST_LOTTERY_WINNER_WEBHOOK`, `STOCK_MANUAL_INTERVENTION_WEBHOOK`, `WORKFLOW_STATUS_WEBHOOK`, `PLAYER_TRADE_DM`이다. 제한된 staging 검증만 `WORKER_OUTBOX_ALLOW_PARTIAL=true`와 명시 목록을 함께 사용할 수 있다. 활성 kind에 필요한 webhook/bot token이 없으면 worker는 outbox를 claim하기 전에 기동을 거부한다.

채널 라우팅은 worker의 typed registry 한 곳에서 관리한다. 감사는 `AUDIT`, 공방 접수·발주 요청·단계 원장은 `WORKFLOW`, 편의점 입고·신제품·복권은 `SHOP`, 주가 개입은 `STOCK`, worker 자체 장애는 `OPERATIONS` destination으로 보낸다. 각 destination은 정확한 전용 URL이 필수다. 특히 `WORKFLOW`와 `OPERATIONS`는 감사 채널이나 서로에게 fallback하지 않으므로, 장애 알림을 실패한 workflow URL로 다시 보내는 순환을 만들지 않는다.

범용 outbox 완료 기록은 `SENT`와 `SKIPPED`를 구분한다. 실제 Discord message ID는 운영 추적용으로 DB에만 저장하고 관리자 API에는 노출하지 않는다. 비활성·미연결·수신 불가 사용자, 비공개 공지, 이미 유효하지 않은 예약 단계는 사유가 제한된 `SKIPPED`로 남는다. Discord payload는 발송 직전 embed/field/전체 6,000자 제한을 맞추며 초과 내용은 생략 수를 표시한다.

편의점·주식·연구 카드는 웹이 desired-state만 기록하고 worker만 Discord를 변경한다. 교체 시 새 메시지를 먼저 생성·활성화한 뒤 이전 메시지를 삭제해 실패 중에도 기존 카드가 사라지지 않는다. 정기 주식 공시는 개요·상승·하락·보합/특수 종목을 네 개의 독립 카드로 유지한다. 아메리 DM에 같은 공방 요청의 여러 과거 단계가 동시에 밀려 있으면 이미 낡은 단계는 `superseded_by_newer_due_event`로 남기고 최신 도달 단계만 보낸다.

`integration_outbox.dedupeKey`는 queue 문서 중복을 막는다. Bot Create Message 기반 DM은 `nonce`와 `enforce_nonce`도 사용한다. 반면 Discord Execute Webhook에는 같은 nonce 계약이 없으므로, 2xx 응답 직후 프로세스가 종료되는 매우 짧은 구간까지 외부 webhook 정확히 한 번을 보장하지는 못한다. 이 전달은 queue 수준 멱등 + 외부 at-least-once로 분류한다. 엄격한 외부 exactly-once가 필요하면 bot channel 전송 또는 수신측 idempotency/reconciliation을 별도 설계한다.

## 로컬 검증

```bash
pnpm install --frozen-lockfile
pnpm build:worker
pnpm test:worker
cd StarGateV2
pnpm db:preflight-worker-indexes
```

마지막 명령은 대상 MongoDB를 읽기만 하며 필수 인덱스의 이름·key 순서·unique·partial·TTL 옵션, 금지된 `stock_price_history` TTL, 중복 그룹 수, due query 실행계획을 출력한다. 가격 이력은 TTL 없는 영구 `createdAt` 인덱스를 요구한다. 문서 키나 payload는 출력하지 않고 blocker가 있으면 종료 코드 2를 반환한다. 정확한 순서는 `read-only 검사 → 별도 승인 → one-shot 적용 → exact spec 재검사 → writer 배포`다. Docker 빌드 컨텍스트는 저장소 루트, Dockerfile은 `stargate-worker/Dockerfile`이다.

## 운영 권한 경계

이 구현은 코드와 dry-run/shadow 실행 준비까지만 포함한다. 아래 작업은 대상과 변경 전후 상태를 제시하고 별도 운영 승인을 받은 뒤 수행한다.

- live index/collection 생성
- Dokploy application, schedule, domain, secret 변경
- GitHub Dokploy webhook 실제 호출
- `WORKER_MODE=active` 전환
- Discord DM/webhook 발송
- Dokploy schedule owner 변경 또는 웹 수동 복구 route 호출
- 운영 DB의 크레딧, 인벤토리, 재고, 주식, 알림 변경

세부 순서는 [컷오버 runbook](./cutover-runbook.md), 기능별 소유권은 [이관 매트릭스](./migration-matrix.md)를 따른다.
