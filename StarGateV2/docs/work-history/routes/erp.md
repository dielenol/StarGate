# /erp

## 2026-07-30 · 기능 변경 · 실시간 운용 대시보드

- 대시보드 서버 집계와 API가 같은 조회 서비스를 사용하고 전체 화면을 `initialData` 기반 Query로 전환했다.
- 알림·잔액·세션·위키·캐릭터·가입/작전 지표가 관련 resource 변경 후 갱신되며 장애 중에는 60초 polling으로 폴백한다.
- 검증: realtime Query 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-07-31 · 성능 최적화 · 대시보드 집계 경량화

- "오늘 세션" 카운트가 한 달치 세션과 참여자 enrich(약 5쿼리)를 로드하던 것을 enrich 생략 카운트 함수로 교체했다 (60초 폴링마다 절약).
- 최근 위키 3건을 전체 로드 + JS 재정렬 대신 DB sort+limit 조회로 교체했다.
- 검증: KST 경계·구경로 등가성 oracle 테스트 7건, `pnpm build`
- 관련 커밋: `e1bd14f`
