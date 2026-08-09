# /erp/admin/credits

## 2026-07-31 · 성능 최적화 · 운영 캐릭터 스캔 중복 제거와 리워드 배치화

- 6개 초기 데이터 빌더가 각자 재수행하던 운영 캐릭터 파생 스캔(약 11쿼리)을 렌더 패스 `cache()`로 1회화했다 (3쿼리).
- 세션 리워드 후보 빌더의 응답자별·세션별 루프 쿼리를 `$in` 배치 3쿼리로 교체했다. `/api/erp/admin/credits/sessions`는 동일 헬퍼를 쓰므로 자동 반영.
- main 캐릭터 선정 규칙(MAIN tier 판정·GM NPC 폴백·정합성 위반 라벨)은 기존 단건 경로와 등가임을 분기 단위로 대조했다.
- 검증: `pnpm lint`, `pnpm typecheck`, `pnpm build`
- 관련 커밋: `e1bd14f`

## 2026-08-09 · 안정성 개선 · 작전 크레딧 멱등·동시성 보호

- 관리자 증감과 Nochichim의 `adjust/set`을 멱등 operation으로 통일하고, 잔액 변경과 운영 workflow·감사 outbox를 같은 transaction에서 확정한다.
- absolute set은 GET에서 받은 단조 증가 revision이 일치할 때만 적용해 동시 증감을 덮어쓰지 않으며, 문자열 `"false"` 같은 잘못된 음수 허용 입력과 비정상 설명을 거부한다.
- 검증: 작전 크레딧 계약 2건, shared-db credit pool mock 4건, 웹 `typecheck`·`lint`·production build, critical risk review
- 관련 커밋: `45944a0c`
- 운영 경계: 라이브 작전 크레딧 잔액은 조회·변경하지 않았다.
