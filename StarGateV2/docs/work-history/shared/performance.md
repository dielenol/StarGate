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

## 2026-07-31 · 성능 최적화 · RSC 페이로드 프로젝션 (성능 캠페인 Phase 2)

- 메인 캐릭터 조회를 display-lite(identity+lore.name) 캐시 변형으로 교체 — 전 ERP 라우트 layout이 lore 전문 대신 수백 B 페이로드 사용 (play/full 실소비 3곳은 heavy 유지, 두 변형 혼용 금지 문서화).
- 실 DB 29유저 전수 대조로 main 캐릭터 선정 등가 확인 (GM NPC 폴백 2건 실증 포함).
- wiki 목록의 동일 배열 이중 props 전달 제거.
- 검증: `pnpm lint`, `pnpm typecheck`, `pnpm build`, 등가성 테스트 15건
- 관련 커밋: `a174e28`

## 2026-07-31 · 성능 최적화 · 클라이언트 번들·헤더·전송 (성능 캠페인 Phase 3)

- socket.io-client를 dynamic import로 전환 — realtime off(현 운영 기본) 동안 전 ERP 라우트 초기 번들에서 소켓 청크 제외 (빌드 매니페스트 미참조 확인). 재연결 갭 복구는 realtime 매핑 키로 한정.
- ERP 헤더 BGM 진행 표시를 4Hz setState에서 ref 직접 기록으로 — 재생 중 헤더(알림 드롭다운 포함) 리렌더 0.
- jsonWithETag 공용 헬퍼 + 핫 폴링 GET 5곳(trades/dashboard/notifications×2/page-locks) 304 재검증. 디스크 캐시 잔존 트레이드오프는 내부 ERP·개인 단말 전제로 수용 (공용 단말 도입 시 재검토 — 헬퍼 문서 명시).
- 응답 배열 소스 7곳 정렬 보조 키 — ETag 플랩 차단 겸 표시 순서 결정화.
- 검증: 계약/단위 테스트 12건(realtime 9 + http-cache 5 중 12 green), 전 스위트 회귀 없음, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- 관련 커밋: `c10bc33`, `1b3bf56`, `0390f80`

## 2026-08-13 · 성능 최적화 · 사용자 의도 기반 ERP prefetch

- ERP 사이드바의 viewport 자동 prefetch를 끄고 pointer hover·keyboard focus 시의 수동 prefetch만 유지해 첫 화면이 방문하지 않은 route 자산을 선행 로드하지 않게 했다.
- 운영 JTEST `/erp`에서 화면 표시 후 5초 동안 추가되던 script 12개·stylesheet 8개(원문 합계 약 528KB)를 기준선으로 확인했다.
- 검증: prefetch·hero 이미지 계약 테스트, UTC KST 포맷 경계 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- 관련 커밋: `9a80b2f2`
