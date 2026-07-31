# 성능 — 공용 인프라

## 2026-07-31 · 성능 최적화 · RSC 렌더 패스 조회 중복 제거 (성능 캠페인 Phase 1)

- ERP page/서버 헬퍼 41곳의 `auth()` 직접 호출을 React cache 래퍼 `getActiveSession()`으로 교체 — 내비게이션당 users.findOne 2~3회→1회. API 라우트는 렌더 패스가 아니라 대상 아님.
- `getErpPageLockOverrides`와 운영 캐릭터 파생 함수를 `cache()` 래핑해 layout+page 중복 스캔을 제거했다.
- 알림 브로드캐스트 `notifyUsers`를 유저별 순차 insert에서 `insertMany(ordered:false)` 1왕복으로 교체하고, 알림 목록 정렬에 `_id` 보조 키를 추가했다.
- 인벤토리 상세(`/erp/inventory/[characterId]`)·신원조회 상세(`/erp/personnel/[id]`)의 전체 컬렉션 로드를 `$in` 조회로, 장비 연구 랭킹을 aggregation으로 교체했다 (JS 빌더는 reference oracle로 보존).
- `shop_reorder_requests` 복합 인덱스 정의를 추가했다 — 실제 생성은 `pnpm db:ensure-indexes` 실행 필요 (아직 미실행).
- shared-db 신설 함수는 전부 additive(기존 export 시그니처 불변), worker/봇 영향 없음.
- 검증: 등가성 테스트 25건 신규(웜패스/KST 카운트 oracle/벌크 알림/리페치 런타임) + 기존 스위트 회귀 없음(core 7, shop 44, sessions 37), `pnpm lint`, `pnpm typecheck`, `pnpm build`
- 관련 커밋: `e652df2`, `de996ea`, `e1bd14f`, `49d2866`
