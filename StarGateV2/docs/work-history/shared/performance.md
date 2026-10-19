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

- ERP 사이드바의 viewport 자동 prefetch를 끄고 pointer hover·keyboard focus·touch start 시의 수동 prefetch만 유지해 첫 화면이 방문하지 않은 route 자산을 선행 로드하지 않게 했다.
- 운영 JTEST `/erp`에서 화면 표시 후 5초 동안 추가되던 script 12개·stylesheet 8개(원문 합계 약 528KB)를 기준선으로 확인했다.
- 검증: 신규 prefetch·hero·KST 계약 5건 + 기존 대시보드 계약 2건, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- 관련 커밋: `9a80b2f2`, `4d8c01dd`

## 2026-08-30 · 성능 최적화 · 공적 원본 batch와 대시보드 projection

- 명예의 전당과 보고서·신원조회 공적 패널이 공유하는 현재 원본 검증을 일괄 조회로 바꿨다. 고유 보고서 10건 기준 원본 확인은 4회 조회로 묶이며 원장 목록 조회는 별도다. 현재 공개등급·정확한 인물 연결·ACTIVE owner와 source hash 판정을 완화하거나 영속 캐시를 추가하지 않았다.
- 실제 공적 조회 20회 교차 비교에서 source material/공개 응답은 동일했고 p50 490.13→237.27ms, p95 604.85→251.29ms였다. 대시보드 캐릭터 DTO도 22회 동등성 확인 후 JSON 평균 9,009.68→230.32B로 축소했다.
- 운영 ERP 회원 주요 경로, 로컬 GM 관리 포함 10개 경로, 운영 공개 9개 경로의 1280px·390px 화면, Hall 4개 viewport·필터/history·오류 복구·키보드 탐색을 읽기 전용으로 확인했다. API 5종의 미인증 401/private no-store도 확인했다. 운영 mutation 버튼은 누르지 않았다.
- 검증: 집중 62건 통과·DB 통합 1건 skip, core 44건·worker 132건, web/worker build, typecheck, lint, critical risk review P0–P2 없음
- 검증 제한: 기존 `hooks/__tests__/cache-invalidation.test.mjs`는 standalone Node의 `@/` 별칭과 tsx ESM export 해석 문제로 초기화에 실패했다. 해당 공용 runner는 이번 변경에 포함하지 않았다. Hall의 비활성 탭·RSC seed·필터 key·root invalidation·stale-data 보존은 별도 QueryObserver 런타임 11건으로 확인했다. 실데이터에 없는 MAIN 중복·null 사례는 mock으로 검증했다.
- 관련 구현 커밋: `45d9fc0a`
- 후속 작업: 공용 캐릭터 캐시 테스트 runner 정리. 운영 Web Vitals/LCP/TBT 전후 비교와 배포 후 성능 확인은 별도 배포 뒤 수행한다. 임의 cache/index 추가, 의존성 변경, 운영 DB 쓰기·push·배포는 하지 않았다.

## 2026-10-19 · 버그 수정 · DB 장애 시 요청 대기 상한

- shared-db가 MongoClient에 `maxPoolSize`만 넘겨 서버 선택·연결 타임아웃이 드라이버 기본값 30초였다. DB 장애 때 `auth()` jwt 콜백의 사용자 조회를 포함한 ERP 요청이 30초씩 매달렸다. Vercel 함수 기본 타임아웃(300초)은 이를 끊지 못했고, `maxDuration` 10초인 `admin/vtt-runtime`은 오류 응답 전에 504로 잘렸다.
- `lib/db/init.ts`에서 `serverSelectionTimeoutMS`·`connectTimeoutMS`를 5초로 지정했다. Vercel에서 드라이버는 poll 모니터링을 써서 heartbeat 소켓 타임아웃도 5초가 되고, 응답 없는 서버에 걸린 쿼리를 더 빨리 끊는다. shared-db는 두 옵션을 선택 필드로만 노출했다. 지정 값이 URI 쿼리보다 우선하기 때문에, 전역 기본값을 두면 스크립트가 URI로 넣은 15초를 덮어쓰게 된다.
- 감수한 점: Atlas 선거가 5초를 넘기면 primary가 필요한 요청 일부가 실패할 수 있다. `withTransaction`의 120초 재시도는 일시 오류 라벨이 붙은 실패에만 적용된다. 서버 선택 실패에는 라벨이 붙지 않으므로 트랜잭션 요청도 같은 상한에서 끝난다(닫힌 포트 실측: 콜백 1회 시도 후 선택 타임아웃에 실패).
- 검증: 닫힌 포트 URI로 실제 `init.ts`를 import해 `getDb()` 실패 5.0초 확인(옵션 없는 비교군 30.0초). shared-db `test:client` 5건(응답 없는 서버의 `connectTimeoutMS` 음성 대조 포함). `pnpm typecheck`, `pnpm lint`, 정적 이중 리뷰·런타임 검증 P1 없음
- 관련 구현 커밋: `3a5ab1f3`, `25c33897`
- 후속 작업: 배포 후 Vercel 로그에서 `MongoServerSelectionError`·`MongoNetworkTimeoutError` 빈도를 확인한다.
