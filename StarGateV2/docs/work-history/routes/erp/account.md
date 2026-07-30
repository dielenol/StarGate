# /erp/account

## 2026-07-27 · 반응형 수정

- 사이드바가 유지되는 중간 콘텐츠 폭에서 계정 요약 카드가 지나치게 좁아지지 않도록 4열을 2열로 전환했다.
- 넓은 화면의 4열과 모바일의 1열 구성은 유지했다.
- 검증: 1482px, 1280px, 768px, 390px viewport와 문서 가로 넘침을 확인했다.
- 관련 커밋: `368042a`

## 2026-07-30 · 기능 변경 · 실시간 계정 요약

- 현재 사용자 조회를 서버와 API가 공유하는 Query로 전환해 역할·상태·Discord 연동 요약이 실시간 신호 또는 장애 시 60초 polling으로 갱신된다.
- role/status 변경은 `session-refresh` 뒤 현재 세션과 route를 다시 검증한다.
- 검증: `pnpm lint`, `pnpm typecheck`, `pnpm build:web`, realtime 계약 테스트
- 관련 커밋: `bba8924`
