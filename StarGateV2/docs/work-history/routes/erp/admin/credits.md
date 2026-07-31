# /erp/admin/credits

## 2026-07-31 · 성능 최적화 · 운영 캐릭터 스캔 중복 제거와 리워드 배치화

- 6개 초기 데이터 빌더가 각자 재수행하던 운영 캐릭터 파생 스캔(약 11쿼리)을 렌더 패스 `cache()`로 1회화했다 (3쿼리).
- 세션 리워드 후보 빌더의 응답자별·세션별 루프 쿼리를 `$in` 배치 3쿼리로 교체했다. `/api/erp/admin/credits/sessions`는 동일 헬퍼를 쓰므로 자동 반영.
- main 캐릭터 선정 규칙(MAIN tier 판정·GM NPC 폴백·정합성 위반 라벨)은 기존 단건 경로와 등가임을 분기 단위로 대조했다.
- 검증: `pnpm lint`, `pnpm typecheck`, `pnpm build`
- 관련 커밋: `e1bd14f`
