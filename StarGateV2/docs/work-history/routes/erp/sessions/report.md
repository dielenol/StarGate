# /erp/sessions/report

## 2026-07-27 · 반응형 수정

- 모바일에서도 지도와 표적 카드의 원본 비율을 유지하도록 지도 stage 최소 너비를 고정했다.
- 좁은 화면에서는 지도 영역만 가로 스크롤해 겹치거나 잘리지 않고 전체 표적을 확인할 수 있게 했다.
- 검증: 1482px, 1280px, 768px, 390px viewport와 지도 scroll 영역을 확인했다.
- 관련 커밋: `8577453`

## 2026-07-30 · 기능 변경 · 보고서 상세 Query와 CAS

- 보고서 상세 본문과 전개 기록을 detail Query에 연결했다.
- 편집 중 외부 수정은 입력을 폐기하지 않고 저장을 잠그며 `expectedUpdatedAt` 불일치는 `409 STALE_VERSION`으로 처리한다.
- 검증: shared-db CAS 26건, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`
