# 장기 실행 worker와 durable 처리

## 2026-07-27 · 아키텍처 변경

- 예약 작업, integration outbox와 realtime checkpoint를 장기 실행 worker가 처리할 수 있는 공용 계약과 런타임을 추가했다.
- 경제·재고·세션 mutation을 멱등 operation·transaction 경계로 보강하고 외부 Discord 전달을 durable outbox로 전환했다.
- 인증 ticket 기반 realtime invalidate와 Query 재검증을 ERP에 연결했다.
- worker 전용 인덱스 적용 범위를 필수 항목으로 제한하고 DB·TTL 영향을 fail-closed preflight로 확인하도록 했다.
- 검증: core 계약, lease 복구, outbox, realtime, socket, scheduled job과 worker 인덱스 테스트를 보강했다.
- 관련 커밋: `430e310`, `745de5f`, `d3b5ff1`

## 2026-08-14 · 기능 확장 · NOVEX 회차·복구 소유권

- `stargate-worker`가 KST 09·13·18·23시 가격 회차, 다음 회차 전 재시도, 오래된 slot 병합과 정규 일요일 조기 폐장·월요일 이월을 담당하도록 했다.
- 웹 cron은 인증된 수동 복구 진입점으로 유지하고, `disabled|shadow|enabled` 모드와 durable 복구 outbox로 계산·실행·운영 전환을 분리했다.
- 23시 장부와 충격 공시·정지·냉각 Discord 전달은 desired-state·partition 순서·멱등 키로 수렴시키고, 늦게 복구된 종가 브리핑은 생략한다.
- 검증: core 31건, worker 101건, production build, index preflight 계약, critical risk review
- 관련 커밋: `fb012220`
- 운영 경계: Dokploy 일정·worker/Web 플래그·라이브 outbox와 Discord 상태는 변경하지 않았다.

## 2026-08-17 · 버그 수정 · 정기 공시 슬롯 복구

- `stocks.tick`이 NOVEX enabled에서는 23시, legacy에서는 종전 12시 회차를 Discord 정기 공시 슬롯으로 쓰도록 분기했다. 직전 구현은 legacy 경로도 23시로 판정해, `disabled`·`shadow` 모드에서 시장감시실 장부가 한 번도 갱신되지 않았다.
- `shadow`는 09·13·18·23시 중 NOVEX 슬롯만 preview하고 legacy 시세는 12·13시에서만 확정하며, 슬롯별 shadow-legacy 가격 비교를 job summary에 남긴다.
- active 유상증자가 있는 동안 `disabled`·`shadow` legacy tick은 fail closed로 중단한다.
- 검증: core·worker 104건, shared 주식·migration 계약 29건·replica 전용 3건 skip, `pnpm typecheck`, 전체 `pnpm lint`, production build
- 관련 커밋: `9d37d3ec`
- 운영 경계: Dokploy 일정·worker/Web 플래그·라이브 outbox와 Discord 상태는 변경하지 않았다.

## 2026-08-22 · 버그 수정 · 변동성 냉각 공시 통합

- 같은 가격 회차에서 여러 종목이 자동 냉각되면 종목별 시작·해제 공시를 반복하지 않고, 전체 대상과 등락 정보를 담은 시작 1건·해제 1건으로 묶도록 변경했다.
- 회차 기업행동·충격 공시·냉각 시작·해제를 공용 outbox partition으로 직렬화해 원인과 상태 전환 순서를 보존하고, 유상증자 안전 거절 이벤트도 worker가 정상 처리하도록 보강했다.
- 기존 종목별 단건 payload와 rolling deploy 호환을 유지하고, 9종목 전체 급변 시 마지막 종목까지 Discord field 제한 안에 노출되는지 검증했다.
- 검증: shared/outbox 집중 계약 37건, worker 107건, core 33건, `pnpm typecheck`, 전체 `pnpm lint`, production build, critical risk review
- 관련 커밋: `aef555e5`
- 운영 경계: 라이브 outbox·Discord·주가·거래 상태는 변경하지 않았다. 배포 전에 이미 적재된 종목별 냉각 이벤트는 자동 병합하지 않는다.

## 2026-08-22 · 기능 확장 · 연구 공로 일일 공지

- `research.daily-ranking`이 KST 일일 slot에서 전체 기간 TOP 3 공개 스냅샷과 기존 연구 webhook용 desired-state를 요청하도록 추가했다. 같은 날짜·source hash·format은 revision을 늘리지 않고, 다음 날짜에는 결과가 같아도 새 일일 revision을 만든다.
- 새 카드를 생성·활성화한 뒤 전날 카드를 삭제하고, 명확한 HTTP 실패는 lease로 재시도한다. Webhook POST 결과가 불명확하면 기존 카드를 유지한 채 `DELIVERY_UNKNOWN`으로 격리해 자동 중복 발행을 막는다.
- 같은 날짜의 오래된 실행이 최신 결과를 덮지 않도록 `desiredGeneratedAt` atomic fence와 실제 재시도 시각을 사용한다. 빈 순위는 카드 없이 공개 empty snapshot으로 수렴한다.
- 검증: `pnpm test:worker` core 35건·worker 114건, `pnpm build:worker`, 동일 날짜 역전 경쟁·source hash·카드 create-before-retire·응답 유실 격리 회귀 테스트, critical risk review
- 관련 커밋: `9b2b7897`
- 운영 경계: Dokploy 21:00 KST schedule, production consumer 활성화, 라이브 스냅샷 생성과 Discord 첫 발송은 실행하지 않았다.

## 2026-08-22 · 안정성 개선 · 연구 공지 DELIVERY_UNKNOWN 복구 경계

- Webhook POST 응답 유실 격리는 자동 재발행하지 않고, `adopt` 또는 `retry` dry-run plan과 digest를 확인한 뒤에만 실행할 수 있는 전용 reconciliation CLI를 추가했다.
- `adopt` 후보는 현재 활성 카드와 달라야 하며 설정된 연구 webhook의 GET으로 소유권을 다시 확인한다. Mongo host 집합과 DB의 credential 비노출 fingerprint, 후보 증거, revision·lease·message 배열 CAS를 plan digest에 결합해 다른 cluster나 변경된 상태에는 쓰지 않는다.
- 격리 오류 원인을 새 일일 revision에서도 보존하고 worker health에서 즉시 CRITICAL로 집계한다. 병렬 health count 사이에 격리가 생겨도 정상 복구로 오보하지 않으며, 복구 뒤에는 더 최신 requested revision까지 create-before-retire 순서로 수렴한다.
- 검증: `pnpm test:worker` core 35건·worker 128건, `pnpm build:worker`, worker typecheck, 후보 소유권·target fingerprint·CAS·adopt/retry 최종 수렴·health count race 회귀 테스트, critical risk review
- 관련 커밋: `a9037103`
- 운영 경계: 실제 Discord GET·reconciliation execute·Dokploy 변경·라이브 DB 수정·첫 카드 발송은 수행하지 않았다. Execute Webhook의 외부 exactly-once 한계 때문에 후보 의미 판정과 라이브 실행에는 정확한 운영 대상과 별도 승인이 필요하다.

## 2026-08-24 · 운영성 개선 · 연구 공로 일일 cadence 감시

- KST 21:00 실행에 15분 유예를 두고, 이후에도 당일 `research.daily-ranking` 슬롯이 없으면 worker 운영 경보에 `RESEARCH_RANKING_CADENCE` WARNING을 생성한다. 전날 성공 행이 남아 있어도 정상으로 오인하지 않는다.
- 같은 cadence helper를 GM 연동 현황에서도 사용해 worker 경보와 화면 판정을 일치시켰다.
- Discord payload 테스트를 금·은·동 3명 전체로 확장하고, 기여자가 0명이 되면 새 POST 없이 기존 카드만 삭제한 뒤 revision을 동기화하는 동작을 고정했다.
- 검증: `pnpm test:worker` core 36건·worker 130건, `pnpm build:worker`, 웹 관리자 계약 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `3123e61d`
- 운영 경계: Dokploy schedule 생성, production consumer 활성화, 라이브 DB 수정과 Discord 첫 발송은 수행하지 않았다. active worker를 일정 등록보다 먼저 전환하면 cadence WARNING이 발생하므로 운영 활성화 순서를 함께 승인해야 한다.

## 2026-08-26 · 기능 확장 · 작전 공적 분석 consumer

- `honor-analysis` consumer가 U 보고서·정확히 연결된 플레이어 AGENT만 claim하고, proposer·critic의 독립 판정과 엄격한 근거 검증을 통과한 결과만 공적 원장에 반영하도록 했다.
- 보고서 revision·전체 동명 캐릭터·소유자 상태를 transaction CAS로 재검증하고 모든 Cloud 요청 직전에도 U 등급·source hash를 확인한다. 실패·stale 결과는 기존 확정 기록을 보존한 채 lease 재시도로 수렴한다.
- 기본 dry-run backfill은 개별 원본 재검증 후 manifest만 만들며, issue가 있거나 원본 hash가 달라지면 `--execute` 적용을 거부한다.
- 검증: worker 152건, manifest 5건, shared 공적 계약 7건·DB 환경 의존 1건 skip, `pnpm build:worker`, critical risk review P0/P1 없음
- 관련 구현 커밋: `684efcd7`
- 운영 경계: 인덱스 생성, Cloud dry-run, manifest 적용, Web/worker writer gate 활성화는 별도 운영 승인 전까지 실행하지 않았다.
