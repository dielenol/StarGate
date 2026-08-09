# `stargate-worker` 컷오버 runbook

이 문서는 실행 절차다. 저장소 코드 구현 승인은 live 배포, DB index 생성, Discord 발송, cron owner 전환 승인이 아니다. 각 `승인 게이트`에서 대상과 변경 전후 상태를 제시하고 별도 확인을 받는다.

## 0. 사전 조건

- [ ] 관련 코드의 typecheck, test, build가 통과했다.
- [ ] `@stargate/shared-db` 변경에 대해 StarGateV2, Registra, TRPG, worker 호환 빌드가 통과했다.
- [ ] `scheduled_job_runs`, `integration_outbox`, `worker_checkpoints` 타입/CRUD/index가 구현됐다.
- [ ] 대상 환경에서 `cd StarGateV2 && pnpm db:preflight-worker-indexes`를 실행해 중복 그룹 0건과 필수 index의 이름·key 순서·unique·partial·TTL 옵션을 확인했다.
- [ ] staging due query `explain("executionStats")`의 사용 index와 문서/키 검사량을 기록했다.
- [ ] Dokploy schedule과 웹 수동 복구 실행이 겹치지 않도록 owner 표를 작성했다.
- [ ] rollback 담당자와 관찰 시간을 정했다.
- [ ] secret 값이 저장소, 로그, 스크린샷에 노출되지 않았음을 확인했다.

### 승인 게이트 0 — writer 배포 전 index

아래 순서는 바꾸지 않는다.

1. read-only preflight를 실행해 중복과 현재 index spec을 기록한다.
2. 누락·불일치 index가 있으면 대상 DB, 생성할 정확한 spec, 예상 lock/부하를 제시해 별도 승인을 받는다. 기존 동명 index의 spec이 다르면 one-shot은 교체하거나 drop하지 않고 mutation 전에 실패한다.
3. preflight의 `ttlImpacts`에서 30일 초과 `stock_price_history` 건수와 `wouldBeginDeletion`을 확인한다. TTL index가 누락됐고 삭제 대상이 있으면 예상 삭제량을 별도로 승인받고 `WORKER_INDEX_TTL_PURGE_CONFIRM`에 그 건수를 정확히 지정한다.
4. 승인된 경우에만 대상 DB 이름을 `MONGODB_DB_NAME` 또는 `DB_NAME`에 명시하고 같은 값을 `WORKER_INDEX_TARGET_DB`에 지정한 뒤 `pnpm db:ensure-worker-indexes` one-shot을 실행한다. 두 DB 변수가 충돌하거나 확인값이 없으면 실행은 mutation 전에 실패한다. 이 명령은 preflight와 같은 20개 worker 필수 index만 생성하며 다른 index를 생성·삭제·교체하지 않는다. TTL index는 마지막에 생성한다.
5. 여러 컬렉션의 index 생성은 원자적이지 않다. 중간 실패 시 추가 mutation을 중단하고 read-only preflight를 다시 실행해 생성된 항목과 남은 blocker를 확인한 뒤 재시도 승인을 받는다.
6. read-only preflight를 다시 실행해 blocker 0건과 exact spec 일치를 확인한다.
7. 그 뒤에만 `integration_outbox` writer가 포함된 StarGateV2와 worker 코드를 배포한다.

운영 index 적용 전에 main merge나 Vercel production 배포를 진행하지 않는다. 코드 구현 승인은 index 생성 승인이 아니며, 이 단계에서 Codex가 live 명령을 자동 실행하지 않는다.

Nochichim 작전 크레딧의 `set` producer는 배포 전에 새 계약으로 함께 전환한다. 먼저 GET에서 받은 단조 증가 `revision`을 POST의 `expectedRevision`으로 보내고, 동일한 유효 `requestId`를 `Idempotency-Key` 헤더와 본문에 넣어 staging 왕복을 검증한다. 기존 `mode/value`만 보내는 set 요청은 동시 조정을 덮어쓸 수 있어 호환 fallback 없이 400으로 거부한다. `adjust`의 기존 domain/payload hash는 배포 경계 replay를 위해 유지한다.

## 1. Dokploy application 준비

권장 설정:

| 항목 | 값 |
|---|---|
| Build context | `/` |
| Dockerfile | `stargate-worker/Dockerfile` |
| Container port | `3001` |
| Replica | `1` |
| Memory limit | `512 MB` |
| Initial mode | `WORKER_MODE=shadow` |
| Health | `/healthz` |
| Readiness 관찰 | `/readyz` |

필수 환경변수는 `stargate-worker/.env.example`을 기준으로 Dokploy secret에서 주입한다. `REALTIME_TICKET_SECRET`은 StarGateV2 발급 측과 동일하되 값 자체를 서로 복사한 로그로 남기지 않는다.

### 승인 게이트 A

다음 외부 변경 전에 별도 승인을 받는다.

- Dokploy application 생성/배포
- `DOKPLOY_STARGATE_WORKER_WEBHOOK` GitHub secret 등록
- `stargate-worker-deploy` GitHub Environment 생성과 required reviewer 설정
- `realtime.ordonet.co.kr` DNS/Domain/TLS 연결
- 운영 MongoDB 접속 정보 주입

## 2. Passive shadow 배포

1. Dokploy의 `WORKER_MODE=shadow`, replica 1을 먼저 확인한다.
2. 최초 shadow 배포는 GitHub Actions의 `Deploy bots`를 수동 실행해 `target=worker-shadow`와 shadow 확인 체크를 명시한다. 컷오버 완료 뒤에는 worker 영향 경로의 main push가 Dokploy webhook을 자동 호출한다.
3. `/healthz`가 200이고 프로세스 상태가 `RUNNING`인지 확인한다.
4. `/readyz`에서 `mongo`, `consumers`, `changeStream`이 모두 true인지 확인한다.
5. `consumer_tick` 로그가 `mode=shadow`이고 due 수만 기록하며 claim, Discord REST/webhook, 경제 DB mutation이 0건인지 확인한다.
6. whitelist 컬렉션 변경을 테스트 DB에서 만들고 `invalidate` resource만 발생하는지 확인한다.
7. MongoDB 권한 오류, Change Stream 종료, SIGTERM 재배포 시 readiness와 graceful shutdown을 확인한다.

shadow는 `worker_checkpoints`에 resume token을 기록한다. 이는 passive 단계에서 허용하는 유일한 DB write이며, 실제 배포 전 별도 운영 승인이 필요하다. 손상/resume 실패 시 checkpoint를 비우고 전체 invalidate한 뒤 새 stream을 여는지 검증하기 전에는 active로 전환하지 않는다.

## 3. Durable 외부 전달 이관

한 번에 한 consumer만 전환한다.

1. `WORKER_CONSUMERS=ameri-dm`
2. `WORKER_CONSUMERS=ameri-dm,research-card`
3. `shop-restock` 추가
4. `stock-market-wire` 추가
5. staging에서 범용 `integration_outbox` kind를 한 종류씩 검증한 뒤 production은 전체 kind로 전환

도메인 consumer와 범용 outbox는 서로 다른 설정이다. `WORKER_CONSUMERS`에는 `ameri-dm`, `research-card`, `shop-restock`, `stock-market-wire`만 넣는다. 범용 outbox의 제한된 staging 검증은 `WORKER_OUTBOX_ALLOW_PARTIAL=true`와 검사할 kind 목록을 함께 사용하고, production active는 반드시 `WORKER_OUTBOX_KINDS=all`, `WORKER_OUTBOX_ALLOW_PARTIAL=false`를 사용한다. 지원 kind는 GM 감사, 캐릭터 변경, 공방, 발주 요청/완료, 편의점 신제품 출시, 미스터비스트 복권 고액 당첨, 수동 주가 공시, 중앙 workflow 상태, 거래 DM이다. typed destination별 `DISCORD_WEBHOOK_*`, `AMERI_DISCORD_BOT_TOKEN`, `REGISTRAR_DISCORD_BOT_TOKEN`을 claim 전에 주입한다.

각 consumer 공통 기준:

- [ ] 승인 게이트 0의 exact index 검증이 writer 배포 전에 완료됐다.
- [ ] due query에 적절한 index가 있고 staging `explain("executionStats")`를 확인했다.
- [ ] lease 획득/만료/재시작 시 한 delivery만 완료된다.
- [ ] Discord 403/429/5xx/timeout이 정책대로 skip 또는 backoff된다.
- [ ] 발송 직전 사용자 ACTIVE 상태와 Discord 연결을 재조회한다.
- [ ] 기존 Vercel 직접 전송을 끄기 전에 worker 성공 증거를 확보했다.

`integration_outbox` 전용 기준:

- [ ] `dedupeKey` 중복 enqueue가 한 queue 문서로 수렴한다.
- [ ] 최대 8회 후 `DEAD`가 남고 자동 삭제되지 않는다.
- [ ] 마지막 claim 직후 crash한 문서도 lease 만료 뒤 sweeper가 `DEAD`로 전환한다.
- [ ] DM은 Discord `nonce`/`enforce_nonce` 재시도에서도 한 메시지로 수렴한다.

### DEAD workflow 단계 복구

파티션 안의 앞 단계가 `DEAD`가 되면 뒤 단계 전달은 의도적으로 정지한다. 자동 skip이나 일괄 재시도는 하지 않는다.

후보와 blocked count를 확인하는 read-only 조회는 다음 projection을 기준으로 한다. payload와 오류 원문은 출력하지 않는다.

```javascript
db.integration_outbox.aggregate([
  { $match: { status: "DEAD", partitionKey: { $exists: true } } },
  {
    $lookup: {
      from: "integration_outbox",
      let: {
        partition: "$partitionKey",
        orderAt: "$partitionOrderAt",
        createdAt: "$createdAt",
        eventId: "$_id",
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$partitionKey", "$$partition"] },
                { $in: ["$status", ["PENDING", "PROCESSING", "DEAD"]] },
                {
                  $or: [
                    { $gt: ["$partitionOrderAt", "$$orderAt"] },
                    {
                      $and: [
                        { $eq: ["$partitionOrderAt", "$$orderAt"] },
                        { $gt: ["$createdAt", "$$createdAt"] },
                      ],
                    },
                    {
                      $and: [
                        { $eq: ["$partitionOrderAt", "$$orderAt"] },
                        { $eq: ["$createdAt", "$$createdAt"] },
                        { $gt: ["$_id", "$$eventId"] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        { $count: "count" },
      ],
      as: "blocked",
    },
  },
  {
    $project: {
      kind: 1,
      partitionKey: 1,
      partitionOrderAt: 1,
      createdAt: 1,
      attempts: 1,
      deadAt: 1,
      blockedCount: {
        $ifNull: [{ $arrayElemAt: ["$blocked.count", 0] }, 0],
      },
    },
  },
  { $sort: { deadAt: 1, _id: 1 } },
]);
```

1. 관리자 연동 현황은 kind별 이상 유무와 건수 확인에만 사용한다. 승인된 read-only DB query 또는 전용 preflight로 정확한 outbox `_id`, `partitionKey`, `partitionOrderAt`, `attempts`, `deadAt`과 뒤에 막힌 단계 수를 확인한다. 운영 화면의 aggregate만 보고 대상을 추정하지 않는다.
2. 선택한 `_id`의 `lastError`는 운영자 로컬에서만 확인해 `CONFIG/AUTH/RATE_LIMIT/NETWORK/PAYLOAD/LEASE/UNKNOWN`으로 분류하고 원문을 로그·스크린샷·대화에 복사하지 않는다. webhook 권한·payload·rate limit 같은 원인을 먼저 고치고, 이미 Discord에 전달됐는지는 채널 이력과 대조한다. 전달 여부가 불명확하면 재발송하지 않는다.
3. 재시도가 안전한 정확한 한 문서에 대해서만 별도 live mutation 승인을 받는다. 승인 문장에는 `_id`, workflow/partition, `DEAD → PENDING`, 예상 재발송 1건과 뒤 단계 해제를 명시한다.
4. 승인 뒤 `_id + status: DEAD` 조건으로 guarded update하여 `status=PENDING`, `attempts=0`, `availableAt=현재 시각`, `updatedAt=현재 시각`으로 바꾸고 `deadAt`, `lastError`, `leaseToken`, `leaseUntil`을 제거한다. 조건 불일치 시 아무것도 수정하지 않는다.
5. 같은 `_id`의 재시도 결과와 partition의 다음 단계가 순서대로 처리됐는지 재조회한다. 실패하면 추가 mutation을 중단하고 새 상태를 보고한다.

정책상 전달하지 않기로 결정한 이벤트도 DB에서 임의로 `DELIVERED` 처리하지 않는다. 감사 가능한 `SKIPPED` 결과와 reconciliation API가 별도로 구현되기 전에는 운영자 수동 skip을 금지한다.

아메리/desired-state 전용 기준:

- [ ] 기존 10분 lease와 5분 retry가 재시작 후에도 이어진다.
- [ ] `nextAttemptAt` 전에는 실패 대상을 다시 claim하지 않는다.
- [ ] 이 모델은 8회 DEAD가 아니라 기존 지속 retry이므로 stuck due/oldest lag 경보를 둔다.

Discord webhook은 queue 중복 방지는 보장하지만 Execute Webhook 자체에는 bot Create Message의 `enforce_nonce`가 없다. 응답 수신 직후 완료 기록 전 장애까지 외부 exactly-once가 필수라면 이 컷오버를 중지하고 bot channel 전송 또는 수신측 idempotency/reconciliation을 먼저 설계한다.

### 승인 게이트 B

각 consumer의 `active` 전환과 실제 Discord/webhook 발송은 전달 종류, 예상 대상 수, old owner → new owner를 제시하고 승인받는다.

## 4. 예약 작업 이관

전환 순서:

1. 편의점 `shop.refresh`
2. 주식 `stocks.tick`
3. 수당 `credits.daily-allowance`
4. ERP 세션 알림 `sessions.erp-reminders`

Dokploy timezone을 `Asia/Seoul`로 확인하고 다음 schedule을 등록한다.

| Job | Cron |
|---|---|
| shop.refresh | `0 11 * * *` |
| stocks.tick | `0 12 * * *` |
| credits.daily-allowance | `0 12 * * *` |
| sessions.erp-reminders | `0 21 * * *` |

기존 `/api/cron/*` route에는 Vercel schedule owner가 없다. 인증된 수동 복구 진입점으로만 유지하며 `/api/cron/stocks/tick`은 `job=stocks`, `job=daily-allowance`, `job=all` 중 하나를 명시하지 않으면 mutation하지 않는다. legacy owner flag와 기본 활성화 helper는 제거했다.

각 job은 replica set 기반 staging에서 동일 `(jobName, slotKey)` 동시 호출 100개 중 실행권 1건, 실제 mutation 1회임을 먼저 확인한다. 수동 복구를 사용할 때도 실행 대상과 현재 slot 완료 여부를 읽기 전용으로 확인하고 별도 운영 승인을 받은 뒤 호출한다. 어떤 시점에도 같은 job의 schedule owner는 하나만 둔다.

ERP 세션 알림은 마지막 old 21:00 실행 직후 old owner를 끄고 다음 KST 일자부터 새 dedupeKey를 적용한다. Registra/TRPG Discord reminder 필드는 수정하거나 소비하지 않는다.

### 승인 게이트 C

아래는 각각 별도 승인 대상이다.

- Dokploy schedule 생성/활성화
- `WORKER_MODE=active` 설정
- 수동 복구 route 호출 또는 Dokploy schedule owner 변경
- 운영 크레딧/재고/주식/알림 mutation

## 5. WebSocket 활성화

1. StarGateV2는 `REALTIME_CLIENT_MODE=off`로 배포해 기존 polling 동작을 먼저 확인한다.
2. `POST /api/erp/realtime/ticket`이 활성 세션만 60초 ticket을 발급하는지 확인한다.
3. Dokploy Domain을 worker port 3001에 연결하고 WSS만 노출한다.
4. 허용 origin에서 `/erp`, WebSocket transport로만 연결되는지 확인한다.
5. 잘못된 서명, issuer, audience, handshake 전에 만료된 ticket, 비ACTIVE ticket을 거부한다. 60초 TTL은 handshake 시작 기한이며 이미 인증된 socket의 연결 수명으로 사용하지 않는다.
6. 테스트 환경에서 `REALTIME_CLIENT_MODE=observe`로 전환하고 WebSocket invalidation과 polling 결과를 최소 24시간 비교한다.
7. resource → TanStack Query key 매핑과 100ms batch 안의 같은 Query root refetch가 최대 1회인지 확인한다.
8. 알림은 대상 사용자에게만 도착하고 다른 사용자는 notification Query를 재조회하지 않는지 확인한다.
9. 플레이어 거래 생성·제안 변경·확정·취소가 두 당사자 화면에 2초 안에 반영되고 작성 중 초안이 원격 revision으로 덮어써지지 않는지 확인한다.
10. WebSocket frame에 사용자 ID, 이름, 잔액, 수량, DB 본문이 없는지 확인한다.
11. role/status 변경 시 `session-refresh` 뒤 해당 socket과 검증 중 handshake가 종료되고 현재 세션/route가 재검증되는지 확인한다.
12. socket/Change Stream 장애 시 active Query 전체를 한 번 재조회하고 polling이 재개되며, 기존 HTTP Query와 mutation은 정상 동작하는지 확인한다.
13. reconnect 또는 resume gap에서 active Query 전체를 한 번 재검증한 뒤 polling이 중지되는지 확인한다.
14. 위 blocker가 0건일 때만 `REALTIME_CLIENT_MODE=primary`로 전환한다.

초기 운영은 replica 1이다. 두 개 이상으로 늘리기 전 Redis adapter 또는 동등한 fan-out/checkpoint 소유권 설계를 추가한다.

### 승인 게이트 D

`observe`와 `primary`의 Vercel/Dokploy 환경변수 변경은 각각 별도 운영 승인 대상이다. 코드 배포와 로컬 테스트는 live WebSocket 활성화 승인이 아니다.

### WebSocket rollback

1. StarGateV2의 `REALTIME_CLIENT_MODE`를 `off`로 되돌린다.
2. 전환 대상 Query가 기존 fallback polling을 다시 사용하는지 확인한다.
3. worker WebSocket 장애가 HTTP 조회, 사용자 mutation, 경제 transaction에 영향을 주지 않았는지 확인한다.
4. 원인과 마지막 정상 event ID, Change Stream checkpoint, 영향 페이지를 기록한다.

## 6. Registra finalization 확인

1. 새 close/cancel은 시작 시 trigger, 요청자, 취소 사유, operation key를 불변 저장한다.
2. 결과 메시지는 `PENDING → DISPATCHING → SENT`로 진행하고 `SENT`에는 Discord message ID가 있어야 완료된다.
3. 발송 성공 여부가 불확실한 `DELIVERY_UNKNOWN`은 자동 재발송하지 않는다.
4. 전달·로그·trigger context를 복원할 수 없는 기존 pending은 `LEGACY_STATE_UNKNOWN`으로 격리한다.
5. 위 두 격리 상태는 Discord와 세션 로그를 직접 대조하는 운영 reconciliation 절차가 준비되기 전 자동 해제하지 않는다.

## 7. 관찰 지표

Production은 workflow webhook과 다른 전용 `DISCORD_WEBHOOK_OPS_URL`을 필수로 둔다. workflow destination 자체가 실패할 때 같은 URL로 장애 알림을 보내는 순환 fallback을 허용하지 않는다. 현재 operational incident/cooldown 상태는 worker 메모리에만 있으므로 재시작 뒤 지속 장애가 한 번 더 알림될 수 있고, 재시작 사이 해소된 장애의 복구 메시지는 보장되지 않는다. 이 제한을 수용할 수 없다면 active 컷오버 전에 incident 상태를 MongoDB에 영속화한다.

- queue depth, oldest available age
- claim conflict, lease expiry/reclaim
- retry/DEAD 건수
- desired-state stuck due/oldest retry age
- Discord 403/429/5xx/timeout
- job duration, slot duplicate
- Change Stream disconnect/resume/gap
- socket connection/reauthentication count
- DB commit → 열린 화면 반영 P95, 목표 2초 이하
- 100ms batch당 Query root refetch 횟수, 목표 최대 1회
- `primary + connected`에서 전환 대상 고정 polling 횟수, 목표 0회
- `/readyz` component 상태

로그에는 token, Mongo URI, Discord ID 외의 불필요한 개인정보, payload 전문을 남기지 않는다.

## 8. Rollback

1. 새 owner의 schedule/consumer를 먼저 중지한다.
2. 진행 중 lease가 만료되거나 안전하게 release됐는지 확인한다.
3. 같은 slot/dedupeKey가 이미 완료됐는지 조회한다.
4. 보호된 Vercel route 또는 기존 consumer를 한 owner만 활성화한다.
5. Discord/경제 mutation은 자동 보상하지 않는다. 이미 발생한 운영 변경과 예상 부수 효과를 보고하고 별도 원복 승인을 받는다.
6. 원인, 영향 범위, 마지막 성공 checkpoint와 run history를 기록한다.

WebSocket만 이상한 경우에는 외부 전달·예약 owner를 바꾸기 전에 `REALTIME_CLIENT_MODE=off`로 되돌려 기존 polling 체계를 먼저 복구한다.

DB schema/data를 삭제하는 rollback은 하지 않는다. legacy `tia_bot/` tracked 코드·이미지는 이미 제거됐지만 로컬 DB 파일과 현재 ERP Mongo 컬렉션은 보존한다.
