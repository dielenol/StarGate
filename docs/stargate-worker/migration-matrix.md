# 기능 이관 매트릭스

상태 표기:

- `KEEP`: 현재 런타임 유지
- `CODE_READY`: 구현·로컬 검증 완료, live owner는 아직 이전하지 않음
- `CUTOVER`: 운영 검증과 승인 뒤 owner 전환 완료
- `RETIRED`: 코드 경로 제거, 보존 데이터는 유지

## 요청/경제/콘텐츠

| 기능군 | 현재 owner | 목표 owner | 상태 | 이관 조건 |
|---|---|---|---|---|
| 로그인, 계정, 사용자, RBAC, 페이지 잠금 | StarGateV2 | StarGateV2 | KEEP | 세션 쿠키와 권한 판정은 웹 경계 유지 |
| 캐릭터, 인벤토리, 크레딧 mutation | StarGateV2 | StarGateV2 | KEEP | transaction 완료 후 후속 알림만 enqueue |
| 장비/공방/연구 mutation | StarGateV2 | StarGateV2 | KEEP | 경제 상태 변경은 동기 처리 |
| 편의점 구매/발주 mutation | StarGateV2 | StarGateV2 | KEEP | 재고 transaction과 사용자 응답 유지 |
| 주식 거래 mutation | StarGateV2 | StarGateV2 | KEEP | 보유량/잔액 transaction 유지 |
| 플레이어 거래 mutation | StarGateV2 | StarGateV2 | KEEP | 양측 자산 transaction 유지 |
| 위키, 진영, 보고서, VTT | StarGateV2 | StarGateV2 | KEEP | 변경 시 invalidate 신호만 worker가 전달 |
| 공개 문의/지원 | StarGateV2 | StarGateV2 | KEEP | 현재 닫힘; 재개장 전 영속 접수함 별도 설계 |

## 예약 작업과 웹 수동 복구

| 기존 진입점 | 기능 | 목표 | 상태 | 컷오버 증거 |
|---|---|---|---|---|
| `/api/cron/shop/refresh` | 편의점 일일 재고 | `shop.refresh` | CUTOVER | Dokploy job이 정기 owner, 웹 route는 인증된 수동 복구 |
| `/api/cron/stocks/tick?job=stocks` | NOVEX 09·13·18·23시 회차 | `stocks.tick` | CODE_READY | KST 분 slot·9종목 transaction·누락 병합, 웹 route는 명시 job 수동 복구. 7일 shadow와 별도 cron/flag 승인 뒤 CUTOVER |
| `/api/cron/stocks/tick?job=daily-allowance` | 일일 직급 수당 | `credits.daily-allowance` | CUTOVER | 캐릭터·일자당 ledger 1건, 웹 route는 명시 job 수동 복구 |
| `/api/cron/sessions/reminders` | ERP 세션 알림 | `sessions.erp-reminders` | CUTOVER | Dokploy job이 정기 owner, 웹 route는 인증된 수동 복구 |
| 삭제된 공방 DM cron route | 아메리 DM drain | 상시 consumer | RETIRED | worker consumer만 lease/재시도/nonce를 소유 |

네 CLI 이름과 KST slot 계약, `scheduled_job_runs` coordinator, 도메인 operation 연결까지 구현되어 있다. 주식만 `YYYY-MM-DD HH:mm`, 나머지는 `YYYY-MM-DD` key를 사용한다. 정기 owner는 Dokploy worker 하나이며 남은 `/api/cron/*` route는 Vercel schedule이 아닌 인증된 수동 복구 진입점이다. 주식/수당 복구 route는 `job`을 지정하지 않으면 mutation하지 않는다.

## 비대화형 외부 전달

| 전달 | 현재 방식 | 목표 | 상태 | 비고 |
|---|---|---|---|---|
| 아메리 공방 DM | 공방 요청 내 embedded outbox | worker 전용 consumer | CODE_READY | 10분 lease, 5분 backoff, nonce; 밀린 동일 요청은 최신 도달 단계로 수렴 |
| 연구 Discord 카드 | desired-state | worker consumer | CODE_READY | 새 카드 활성화 뒤 이전 카드 정리, revision/lease와 5분 retry 유지 |
| 편의점 입고 공지 | desired-state | worker consumer | CODE_READY | 웹은 desired-state만 기록, worker가 create-before-retire 교체 |
| 주식 공시 | desired-state | worker consumer | CODE_READY | 네 embed를 메시지 한 건으로 묶고 create-before-retire 교체 |
| GM admin audit | transaction enqueue | `integration_outbox` | CODE_READY | mutation과 감사 enqueue를 같은 session에 기록 |
| 플레이어 거래 DM | transaction enqueue | `integration_outbox` | CODE_READY | 자산 mutation과 enqueue 원자적 커밋, 발송 직전 사용자 재조회 + nonce |
| 공방 상태 webhook/DM | transaction enqueue/embedded outbox | worker consumer | CODE_READY | 접수부터 수령까지 workflow와 위임 단계를 함께 기록 |
| 중앙 workflow 상태 | transaction enqueue | `integration_outbox` | CODE_READY | 공방·거래·발주·연구·관료 표결 단계와 위임 담당 추적 |
| 편의점 발주/입고 webhook | transaction enqueue | `integration_outbox` | CODE_READY | 요청/재고 변경과 enqueue 원자적 커밋 |
| 편의점 신제품 출시 webhook | 상품 생성 transaction enqueue | `integration_outbox` | CODE_READY | 공개·판매 가능 신제품 생성과 enqueue 원자적 커밋 |
| 캐릭터 변경 감사 | transaction enqueue | `integration_outbox` | CODE_READY | 변경·변경 이력·감사 enqueue 원자적 커밋 |
| 수동 주가 조정 공시 | transaction enqueue | `integration_outbox` | CODE_READY | 직접 webhook 제거, 전용 stock webhook 사용 |

production 코드의 `after()` 직접 외부 전송과 편의점·주식·연구 카드의 웹 직접 생성/삭제 adapter는 제거했다. 웹은 desired-state만 기록하고 Discord 변경은 worker 하나가 소유한다. 내부 ERP 알림 생성은 외부 전달과 분리하고, 편의점 입고처럼 경제 transaction과 강하게 결합된 enqueue는 같은 Mongo session에 포함했다.

`integration_outbox`의 생성/claim/complete/fail, 지수 backoff, 최대 8회 후 DEAD persistence와 typed handler/channel registry가 구현되어 있다. 완료는 실제 Discord 발송 `SENT`와 비활성·미연결·비공개·stale 등 정책상 `SKIPPED`를 구분한다. webhook 9종과 거래 DM handler가 있으며 production active worker는 `WORKER_CONSUMERS=all`, `WORKER_OUTBOX_KINDS=all`이 아니거나 필요한 destination secret이 없으면 어떤 문서도 claim하기 전에 기동을 거부한다. 제한된 staging 검증만 두 `*_ALLOW_PARTIAL=true`를 명시해 부분 consumer/kind를 허용한다. 거래 DM은 발송 직전 사용자의 ACTIVE 상태와 Discord 연결을 재조회하고 nonce를 강제한다.

`integration_outbox`의 dedupe는 queue enqueue/claim 중복을 막지만 Discord webhook API에는 bot message의 `enforce_nonce`와 같은 계약이 없다. 따라서 webhook은 네트워크 응답과 완료 기록 사이 장애 구간에서 외부 at-least-once 가능성이 남는다. 아메리·연구·입고·공시 desired-state는 첫 이관에서 범용 outbox로 재작성하지 않았고, 기존 5분 retry를 계속 사용하므로 8회 DEAD 정책 대상이 아니다.

## Registra와 TRPG 경계

| 기능 | 목표 owner | 상태 | 이유 |
|---|---|---|---|
| Registra slash/button/autocomplete | registra-bot | KEEP | Discord interaction deadline/Gateway context |
| 길드 멤버 조회/캐시 | registra-bot | KEEP | Gateway 권한과 캐시 필요 |
| 자동 마감/결과 메시지/PNG | registra-bot | KEEP | 메시지 수정과 Puppeteer 필요. 불확실 전달·legacy pending은 격리 후 수동 reconciliation |
| Registra Discord 리마인드 | registra-bot | KEEP | 기존 reminder sent/lease를 Discord 전용으로 사용 |
| ERP Registra 세션 알림 | worker | CUTOVER | Discord sent/lease를 소비하지 않고 notification dedupeKey 사용 |
| TRPG bot/web | 기존 앱 | KEEP | 이관 범위 밖, shared-db 호환만 보장 |
| ERP TRPG 세션 알림 | worker | CUTOVER | TRPG `reminderSentAt`과 독립 dedupeKey 사용 |

## 실시간 resource

| Mongo 변경군 | invalidate resource |
|---|---|
| users | `users`, `personnel` |
| characters | `characters`, `personnel` |
| credit transaction/balance/pool | `credits` |
| inventory/master items | `inventory` |
| notifications | `notifications` |
| shop/reorder/restock | `shop` |
| stock price/holding/history/wire | `stocks` |
| player trades | `trades` |
| registra/TRPG sessions | `sessions` |
| session reports | `reports` |
| workshop/license/research | `equipment-shop` |
| wiki/revisions | `wiki` |
| faction/institution/activity | `factions` |
| ERP page locks | `page-locks` |

worker는 whitelist 밖 컬렉션을 구독하지 않고, 이벤트에는 위 resource 외 DB 값을 넣지 않는다.

알림과 플레이어 거래의 사용자 ID는 worker 내부 socket 선택에만 사용하며 공개 frame에는 노출하지 않는다. `users.role/status` 변경은 별도 `session-refresh` control event와 handshake fencing으로 현재 세션 재검증을 강제한다.

## ERP 실시간 Query 전환

| 화면군 | 상태 | 동작 |
|---|---|---|
| 전역 알림·페이지 잠금·거래 | CODE_READY | 대상 invalidation, toast, 초안 보존, 장애 시 기존 polling |
| 세션·공방·연구·주식 | CODE_READY | 연결 중 고정 polling 중지, 장애 중 자동 복귀 |
| 편의점·병기부·인벤토리·크레딧 | CODE_READY | 복합 resource 의존성과 본문 Query 갱신 |
| 대시보드·계정·관리자 인벤토리 | CODE_READY | 서버/API 공용 조회와 `initialData` 하이브리드 Query |
| 캐릭터·Dossier·위키·보고서 상세 | CODE_READY | 상세 Query와 편집 중 외부 변경 감지 |
| 캐릭터·위키·보고서 저장 | CODE_READY | nullable `expectedUpdatedAt` CAS, 불일치 `409 STALE_VERSION` |
| 세력 board·접촉 기록 | CODE_READY | board/activity Query와 관련 resource 연동 |

운영 기본값은 `REALTIME_CLIENT_MODE=off`다. live 전환은 `observe` 24시간 비교와 blocker 0건 확인 뒤 `primary`로 진행하며, 이상 시 `off`로 되돌린다. DB backfill, index 적용, live 환경변수 변경은 이 상태 표에 포함되지 않는다.

## Legacy

| 대상 | 처리 | 데이터 경계 |
|---|---|---|
| `tia_bot/` 코드·이미지 | RETIRED | tracked 코드·이미지만 삭제, 로컬 DB와 Mongo 컬렉션 삭제 금지 |
| 과거 Tia migration 문서 | RETIRED | `docs/archive/tia-bot-2026-05/`에 운영 종료 상태로 보관 |
| 역사적 포팅 출처 | Git 이력 유지 | 현재 운영 설명과 분리 |
