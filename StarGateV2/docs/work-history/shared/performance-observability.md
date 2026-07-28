# 성능 관측

## 2026-07-28 · 성능 측정 기반 추가

- 모든 페이지의 실제 사용자 성능을 수집할 수 있도록 루트 layout에 Vercel Speed Insights를 연결했다.
- `@vercel/speed-insights` 의존성과 workspace lockfile을 함께 갱신했다.
- 검증: 병합 diff에서 루트 layout의 수집 컴포넌트 렌더와 의존성·lockfile 반영을 확인했다.
- 관련 커밋: `37565ed`
