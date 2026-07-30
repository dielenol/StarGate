# /erp/credits

## 2026-07-30 · 기능 변경 · 본문 Query 전환

- 서버 최초값으로 고정되던 잔액과 거래 내역 본문을 기존 `useCredits` Query에 연결했다.
- 크레딧·거래 변경 신호와 기존 mutation invalidation 뒤 화면이 즉시 재조회된다.
- 검증: realtime Query 계약 테스트, 거래 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`
