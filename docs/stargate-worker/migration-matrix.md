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

## Vercel 예약 작업

| 기존 진입점 | 기능 | 목표 | 상태 | 컷오버 증거 |
|---|---|---|---|---|
| `/api/cron/shop/refresh` | 편의점 일일 재고 | `shop.refresh` | CODE_READY | 품목·일자당 갱신 1회 |
| `/api/cron/stocks/tick` + `LEGACY_CRON_STOCKS_ENABLED` | 주식 일일 변동 | `stocks.tick` | CODE_READY | 날짜·ticker당 가격/history 1회, old owner 독립 차단 |
| 같은 route + `LEGACY_CRON_DAILY_ALLOWANCE_ENABLED` | 일일 직급 수당 | `credits.daily-allowance` | CODE_READY | 캐릭터·일자당 ledger 1건, 알림 실패·old owner 독립 |
| `/api/cron/sessions/reminders` | ERP 세션 알림 | `sessions.erp-reminders` | CODE_READY | ERP/Discord가 각자 dedupe되어 1회 |
| 공방 DM cron route | 아메리 DM drain | 상시 consumer | CODE_READY | 403/429/timeout/lease/restart/nonce 검증 |

네 CLI 이름과 KST slot 계약, `scheduled_job_runs` coordinator, 도메인 operation 연결까지 구현되어 있다. 결합돼 있던 Vercel 주식/수당 route는 job별 flag로 owner만 독립 전환하며 cron 항목을 늘리지 않는다. 실제 active 실행과 기존 Vercel owner 비활성화는 운영 승인 전까지 하지 않는다.

## 비대화형 외부 전달

| 전달 | 현재 방식 | 목표 | 상태 | 비고 |
|---|---|---|---|---|
| 아메리 공방 DM | 공방 요청 내 embedded outbox | worker 전용 consumer | CODE_READY | 기존 10분 lease, 5분 backoff, nonce 유지 |
| 연구 Discord 카드 | desired-state | worker consumer | CODE_READY | revision/lease와 `nextAttemptAt` 5분 retry 유지 |
| 편의점 입고 공지 | desired-state | worker consumer | CODE_READY | 기존 revision/lease/backoff 유지 |
| 주식 공시 | desired-state | worker consumer | CODE_READY | 기존 revision/lease/backoff 유지 |
| GM admin audit | route enqueue | `integration_outbox` | CODE_READY | 한 문서가 한 queue 전달 |
| 플레이어 거래 DM | route enqueue | `integration_outbox` | CODE_READY | 발송 직전 사용자/Discord 재조회 + nonce |
| 공방 상태 webhook/DM | route enqueue/embedded outbox | worker consumer | CODE_READY | 웹 mutation과 외부 실패 분리 |
| 편의점 발주/입고 webhook | transaction 내 enqueue | `integration_outbox` | CODE_READY | 재고/요청 변경과 enqueue 원자적 커밋 |
| 캐릭터 변경 감사 | route enqueue | `integration_outbox` | CODE_READY | 변경 이력은 웹 transaction 유지 |
| 수동 주가 조정 공시 | route enqueue | `integration_outbox` | CODE_READY | 직접 webhook 제거, 전용 stock webhook 사용 |

production 코드의 `after()` 직접 외부 전송은 제거했다. 내부 ERP 알림 생성은 외부 전달과 분리하고, 편의점 입고처럼 경제 transaction과 강하게 결합된 enqueue는 같은 Mongo session에 포함했다.

`integration_outbox`의 생성/claim/complete/fail, 지수 backoff, 최대 8회 후 DEAD persistence와 handler registry가 구현되어 있다. webhook 6종과 거래 DM handler가 있으며 `WORKER_OUTBOX_KINDS`에 명시한 kind만 claim한다. 거래 DM은 발송 직전 사용자의 ACTIVE 상태와 Discord 연결을 재조회하고 nonce를 강제한다. 활성 kind가 0개이거나 필요한 secret이 없으면 어떤 문서도 claim하기 전에 기동을 거부한다.

`integration_outbox`의 dedupe는 queue enqueue/claim 중복을 막지만 Discord webhook API에는 bot message의 `enforce_nonce`와 같은 계약이 없다. 따라서 webhook은 네트워크 응답과 완료 기록 사이 장애 구간에서 외부 at-least-once 가능성이 남는다. 아메리·연구·입고·공시 desired-state는 첫 이관에서 범용 outbox로 재작성하지 않았고, 기존 5분 retry를 계속 사용하므로 8회 DEAD 정책 대상이 아니다.

## Registra와 TRPG 경계

| 기능 | 목표 owner | 상태 | 이유 |
|---|---|---|---|
| Registra slash/button/autocomplete | registra-bot | KEEP | Discord interaction deadline/Gateway context |
| 길드 멤버 조회/캐시 | registra-bot | KEEP | Gateway 권한과 캐시 필요 |
| 자동 마감/결과 메시지/PNG | registra-bot | KEEP | 메시지 수정과 Puppeteer 필요. 불확실 전달·legacy pending은 격리 후 수동 reconciliation |
| Registra Discord 리마인드 | registra-bot | KEEP | 기존 reminder sent/lease를 Discord 전용으로 사용 |
| ERP Registra 세션 알림 | worker | CODE_READY | Discord sent/lease를 소비하지 않고 notification dedupeKey 사용 |
| TRPG bot/web | 기존 앱 | KEEP | 이관 범위 밖, shared-db 호환만 보장 |
| ERP TRPG 세션 알림 | worker | CODE_READY | TRPG `reminderSentAt`과 독립 dedupeKey 사용 |

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

## Legacy

| 대상 | 처리 | 데이터 경계 |
|---|---|---|
| `tia_bot/` 코드·이미지 | RETIRED | tracked 코드·이미지만 삭제, 로컬 DB와 Mongo 컬렉션 삭제 금지 |
| 과거 Tia migration 문서 | RETIRED | `docs/archive/tia-bot-2026-05/`에 운영 종료 상태로 보관 |
| 역사적 포팅 출처 | Git 이력 유지 | 현재 운영 설명과 분리 |
