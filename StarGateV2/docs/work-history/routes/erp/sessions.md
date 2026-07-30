# /erp/sessions

## 2026-07-30 · 기능 변경 · 세션·RSVP 실시간 갱신

- 현재 월 목록의 60초 polling을 연결 장애 fallback으로 전환했다.
- 최초값으로 고정되던 우측 예정 세션을 서버/API 공용 조회와 Query에 연결했다.
- Registra/TRPG 세션·RSVP 변경 resource가 월 목록과 예정 목록을 함께 갱신한다.
- 검증: `pnpm test:worker`, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`
