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
