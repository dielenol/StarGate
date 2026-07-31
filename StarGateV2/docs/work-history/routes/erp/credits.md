# /erp/credits

## 2026-07-30 · 기능 변경 · 본문 Query 전환

- 서버 최초값으로 고정되던 잔액과 거래 내역 본문을 기존 `useCredits` Query에 연결했다.
- 크레딧·거래 변경 신호와 기존 mutation invalidation 뒤 화면이 즉시 재조회된다.
- 검증: realtime Query 계약 테스트, 거래 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-07-31 · 기능 추가 · 이벤트 보상 거래 유형

- 미스터비스트 복권 당첨금을 `EVENT_REWARD` 거래로 분리해 크레딧 내역에서 `이벤트 보상`으로 표시한다.
- claim ID 기반 고정 request ID와 원자 transaction으로 재시도·다중 요청에도 당첨금이 한 번만 지급되도록 했다.
- 검증: 복권 집중 테스트, `pnpm typecheck`, `pnpm lint`, shared-db build, `pnpm build`
- 관련 커밋: `e733a98`
