# 장기 실행 worker와 durable 처리

## 2026-07-27 · 아키텍처 변경

- 예약 작업, integration outbox와 realtime checkpoint를 장기 실행 worker가 처리할 수 있는 공용 계약과 런타임을 추가했다.
- 경제·재고·세션 mutation을 멱등 operation·transaction 경계로 보강하고 외부 Discord 전달을 durable outbox로 전환했다.
- 인증 ticket 기반 realtime invalidate와 Query 재검증을 ERP에 연결했다.
- worker 전용 인덱스 적용 범위를 필수 항목으로 제한하고 DB·TTL 영향을 fail-closed preflight로 확인하도록 했다.
- 검증: core 계약, lease 복구, outbox, realtime, socket, scheduled job과 worker 인덱스 테스트를 보강했다.
- 관련 커밋: `430e310`, `745de5f`, `d3b5ff1`
