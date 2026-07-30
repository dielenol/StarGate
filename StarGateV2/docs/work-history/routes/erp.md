# /erp

## 2026-07-30 · 기능 변경 · 실시간 운용 대시보드

- 대시보드 서버 집계와 API가 같은 조회 서비스를 사용하고 전체 화면을 `initialData` 기반 Query로 전환했다.
- 알림·잔액·세션·위키·캐릭터·가입/작전 지표가 관련 resource 변경 후 갱신되며 장애 중에는 60초 polling으로 폴백한다.
- 검증: realtime Query 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`
