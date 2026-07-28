# 성능 관측

## 2026-07-10 · 헤더 조회·화면 복구 최적화

- 알림 summary와 polling 정책으로 반복 payload와 stale 화면을 줄였다.
- SSR H1, 오류 화면, 모바일 drawer와 공개 플레이어 화면의 접근성·복구 흐름을 보강했다.
- 검증: 알림 조회 정책, 오류 경계와 영향 화면 변경을 연결 커밋에서 확인했다.
- 관련 커밋: `e263192`

## 2026-07-28 · 성능 측정 기반 추가

- 모든 페이지의 실제 사용자 성능을 수집할 수 있도록 루트 layout에 Vercel Speed Insights를 연결했다.
- `@vercel/speed-insights` 의존성과 workspace lockfile을 함께 갱신했다.
- 검증: 병합 diff에서 루트 layout의 수집 컴포넌트 렌더와 의존성·lockfile 반영을 확인했다.
- 관련 커밋: `37565ed`
