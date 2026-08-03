# 자산 — 공용 인프라

## 2026-07-31 · 성능 최적화 · 이미지·폰트·캐시 정리 (성능 캠페인 Phase 4)

- 사이드카 없던 원본 33개에 WebP 생성 — 경로 헬퍼의 잠재 404 소거 (재검사 0건).
- 위키 마크다운/카탈로그/편의점 HUD/훈련 표적/외부 로고의 원본 PNG 직접 참조를 WebP 경로로 전환.
- 52×52 아바타·54×72 썸네일·238px 초상·랜딩 로고를 next/image로 전환 (표시 크기 기준 재인코딩). 픽셀아트 아이콘은 unoptimized 유지 + 경로 헬퍼만 적용.
- OG 이미지를 1200×630 전용 자산(48KB)으로 교체, 픽셀 폰트 woff2 변환(422KB→41KB), /assets 캐시 1일→7일(SWR 30일).
- WebP로 대체된 원본 PNG/JPG 107개(145MB) 삭제 — public 226MB→81MB. 감사 결과 raw 렌더 참조가 남은 자산(복권 모달 이미지 3종·소다, survey OG, 구 OG 로고)은 KEEP. 프리렌더 HTML 실측으로 실제 서빙 경로가 전부 WebP임을 확인.
- 폰트 정책: Noto Sans KR은 무변경 유지 — 빌드 CSS 실측 gzip 28.5KB이고 weight 배열 지정 시 정적 페이스로 전환돼 오히려 커짐, unicode-range 슬라이싱이 한국어 UI에 최적. 재작업 방지용 기록.
- 검증: `pnpm typecheck`, `pnpm lint`, `pnpm build`, 프리렌더 HTML의 png/jpg 서빙 0건(OG jpg 제외), 자산 계약 테스트 통과
- 관련 커밋: `c396c45`, `210f53cc`, `d8bd99ee`, `10c024b2`
