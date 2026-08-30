# /erp/wiki

## 2026-07-02 · 탐색·링크 처리 개선

- 위키와 보고서 내부 링크를 client navigation으로 전환해 이동 중 피드백을 표시했다.
- 물품 카테고리 정렬을 추가하고 새 문서 액션 배치를 축소했다.
- 관련 문서를 제목뿐 아니라 slug로도 찾고 다른 도메인 접두사는 패널에서 제외했다.
- 검증: 내부 링크, 카테고리 정렬과 RELATED 파서 변경을 연결 커밋별로 대조했다.
- 관련 커밋: `8fb5c04`, `b32b210`, `f0d8764`, `8252f88`

## 2026-08-05 · 기능 추가 · 통합 Lore Explorer

- 위키, 작전 보고서, 인물, 카탈로그, 세력, 기관을 한 검색창에서 조회하는 통합 Lore Explorer와 종류·분류 facet을 추가했다.
- 목록 API를 서버 cursor pagination으로 전환하고 초기 데이터와 infinite query를 연결해 재진입·추가 로드 시 캐시를 재사용한다.
- auxiliary 검색 projection이 없거나 부분 장애인 경우 권한 검사를 유지한 domain fallback과 경고·재시도 UI를 제공한다.
- 위키·보고서·인물·카탈로그·세력 변경은 lore search Query를 함께 무효화하며 비공개 문서는 V 미만에 fail-closed한다.
- 검증: 검색·권한·pagination 계약 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build` 86페이지, 인증된 데스크톱·390px 브라우저에서 가로 overflow 0 및 콘솔 오류 0건
- 관련 커밋: `a57ecd94`
- 후속 작업: live lore index 생성과 projection rebuild는 별도 운영 승인 후 적용·재검증한다.

## 2026-08-07 · 기능 변경 · 보고서 검색·카탈로그 열람 등급

- 통합 Lore Explorer의 live index와 fallback 검색 모두 보고서 `minRole`을 적용해 권한 미달 결과의 제목·존재 여부를 숨긴다.
- 카탈로그 상세의 관련 보고서 카드도 같은 서버 필터를 사용하며, 비공개 카탈로그를 참조하는 보고서는 V 이상으로 제한한다.
- 검증: app 19건, projection 11건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `1949c42d`

## 2026-08-10 · 보안 개선 · 게스트 공개 검색

- 게스트 Lore Explorer를 비회원 공개 검색으로 분리해 `authenticated` 작전 보고서가 live index와 fallback 어느 쪽에서도 결과에 나타나지 않게 했다.
- 개인 소유 검색 조건에는 합성 게스트 ID 대신 nullable viewer를 사용해 private workshop 문서와 충돌하지 않도록 유지했다.
- 검증: 검색·호출처 계약 테스트, 실제 게스트 보고서 검색 결과 0건, 데스크톱 위키 목록 가로 넘침·콘솔 오류 0건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `2df03010`

## 2026-08-10 · 라이브 적용 · S1E6 공개 로어 그래프

- `s1e6-turning-point-part1` mirror와 `last-battalion`을 공개하고 광명회·광원화 바이러스·프로젝트 데드 핸드·스페이스 제로·화이트로즈 본문과 태그를 갱신했다.
- Lore Explorer에서 `NOSB-S1E6-TURNING-POINT-PART1` 쿼리가 보고서·mirror·마지막 대대·관련 Dossier의 정규 링크를 `sourceMode: hybrid`, `degradedSources: []`로 반환한다.
- 검증: 기존 위키 5건의 세션 표식·보고서 링크·공개 상태, 원시 `[[...]]` token 0, revision snapshot 5건, 미인증 검색 API `401`
- 관련 적용 소스 커밋: `1acea89c`

## 2026-08-13 · 라이브 적용 · MINI06 wiki mirror와 검색 그래프

- `mini06-neved` operation-report mirror를 비공개 staging 뒤 공개로 전환하고, 보고서와 동일한 본문·구조화 참조·장면 12개를 연결했다.
- Lore Explorer에서 `개럿 클라이맥` 검색이 신규 Dossier와 `MINI06` 보고서·mirror의 정규 링크를 함께 반환하며 degraded 안내가 없는 것을 확인했다.
- 검증: wiki DB exact 재조회, report/mirror path·alt·caption parity, mirror hero와 본문 이미지 broken 0, 인증된 상세·검색 결과·가로 넘침·콘솔 오류 0, 미인증 wiki `307`·검색 API `401`
- 관련 적용 소스 커밋: `44e73cd3`, `1ffb0ba9`

## 2026-08-13 · 성능 최적화 · RSC 초기 조회 재사용

- RSC가 제공한 목록·통합 검색 결과를 30초 bootstrap 동안 재사용해 마운트 직후 같은 API와 DB 조회를 반복하지 않게 했다.
- 서버 조회 실패로 만든 빈 seed만 즉시 stale 처리해 클라이언트 복구 재시도는 유지하고, realtime·mutation invalidation은 계속 즉시 갱신한다.
- 검증: Query 런타임·wiki·realtime 계약 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`, 인증 로컬 브라우저에서 `/api/erp/wiki` 마운트 재호출·콘솔 오류 0건
- 관련 커밋: `c488f832`

## 2026-08-13 · 성능 최적화 · 최근 문서 중복 조회 제거

- 필터·검색·cursor가 없는 기본 첫 페이지는 같은 visibility와 정렬로 이미 읽은 목록의 첫 5건을 최근 문서로 재사용한다.
- 분류·검색 화면은 기존 전역 최근 문서 조회를 유지해 결과 의미를 바꾸지 않았다.
- 검증: 위키 visibility·pagination 계약, 집중 테스트 47/47, 타입 검사·lint·production build, JTEST 위키 목록 정상 렌더
- 관련 커밋: `6f0bfc0e`

## 2026-08-30 · UI 개선 · 예산 분류 문장과 아이콘 소비처 동기화

- 예산 분류의 공용 IconFinance를 신원조회 재무 기구와 동일한 감사·균형 문장으로 교체했다.
- NOVUS 마스터의 위키 장비 분류를 실제 IconInventoryEquipment에 연결해 기록보관소의 IconEquipment와 구분했다. 문서·분류 데이터와 검색 동작은 유지했다.
- 검증: SVG·OrgIcon·마스터 parity 및 소비처 계약 36건, `pnpm typecheck`, `pnpm lint`, 인증된 1440×1000 위키 목록의 가로 넘침·깨진 이미지·브라우저 오류 0건. 현재 목록에 예산 분류가 없어 해당 glyph는 소스 매핑과 SVG parity로 확인했다.
- 관련 구현 커밋: `eb144b4e`
- 운영 경계: 검증용 문서·카테고리나 라이브 DB 레코드를 생성하지 않았다.
