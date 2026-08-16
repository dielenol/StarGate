# /erp/personnel

## 2026-06-30 · 인물 표시 규칙 수정

- 캐릭터 표시명과 역할·소속 라인을 공용 포매터로 통일했다.
- 검증: 신원조회 카드와 캐릭터 화면이 같은 표시 포매터를 사용하는지 대조했다.
- 관련 커밋: `2f29cb9`

## 2026-07-02 · 조직도·Dossier UI 개선

- 시민사회 하위 분류를 조직도에 통합하고 적대세력별 hover·Dossier 팔레트를 구분했다.
- 조직 drilldown과 인물 카드를 파일 패널형 구조로 정리하고 원본 프로필 이미지를 우선 표시했다.
- 검증: 조직 노드, 카드 팔레트와 아바타 선택 순서를 연결 커밋별로 대조했다.
- 관련 커밋: `b3c13e5`, `e32fd72`, `1a0153c`, `8c5cbc4`, `fa8765f`

## 2026-07-07 · 외부 하위 조직 구조화

- 시민사회와 군부 하위 소속을 별도 그룹으로 분리하고 USA·NOGA 등 외부 조직을 동기화했다.
- 군부·시민사회 연결선과 강조색, 외부 조직 전용 아이콘을 구분했다.
- 검증: 조직 데이터, 그룹 렌더링과 아이콘 매핑을 연결 커밋별로 대조했다.
- 관련 커밋: `49af3f4`, `04089ef`, `74b8740`, `b09b99d`

## 2026-07-15 · 신원 필드 보정

- 누락된 등급을 J로 오인하던 fallback을 제거하고 실명 우선·별칭 분리 표시로 변경했다.
- 별칭을 ERP 최소 글자 크기 14px에 맞췄다.
- 검증: 신원 표시·등급 누락 회귀 테스트와 계산 글자 크기 확인 기록을 대조했다.
- 관련 커밋: `fb4d622`, `dc45c5e`

## 2026-07-27 · 반응형 수정

- viewport가 아니라 실제 ERP 콘텐츠 폭을 기준으로 조직도를 3열에서 1열로 전환하도록 변경했다.
- 권한 안내와 검색 행이 좁은 콘텐츠 영역에서 안전하게 줄바꿈되도록 보정했다.
- 조직도 내부 grid item의 최소 콘텐츠 폭이 캔버스 밖으로 밀어내는 문제를 방지했다.
- 검증: 데스크톱과 모바일 콘텐츠 폭에서 조직도, 권한 안내, 검색 행의 가로 넘침을 확인했다.
- 관련 커밋: `40ba21b`

## 2026-07-30 · 기능 변경 · Dossier 실시간 상세

- Dossier 상세를 기존 personnel detail Query에 연결해 캐릭터·사용자 변경을 열린 화면에 반영한다.
- 편집 중 외부 변경이나 CAS 충돌이 발생하면 작성 중 초안을 보존하고 최신본을 불러오기 전까지 저장을 차단한다.
- 검증: shared-db CAS 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-07-31 · 성능 최적화 · 목록 프로젝션 전환

- 신원조회 목록/API가 전체 캐릭터 문서(원본 시트 전문 loreMd/rawText, play 포함) 대신 카드 필드만의 프로젝션 DTO(루트 11 + lore 6 필드)를 사용한다 — 행당 수 KB → 수백 B.
- 마스킹은 상세와 동일한 필드별 게이트 유지 — 등급 8×오버라이드 9×변형 5(3,960 필드 조합) 등가성 매트릭스 테스트로 "기존에 가려지던 것이 새로 보이는 케이스 0" 고정.
- 이름 마스킹 게이트를 redactNameFields 단일 지점으로 통합 (목록/참조/상세 3경로 공유).
- 검증: 마스킹 등가성 테스트 15건 신규, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- 관련 커밋: `a174e28`

## 2026-07-31 · 버그 수정 · 실명 마스킹 우회 차단 (상세/관계)

- 상세 API/페이지가 원본 시트 전문(loreMd/rawText)을 전 등급에 전송하던 것을 제거 — 필드별 마스킹 게이트 우회 차단 (클라이언트 소비처 0이라 화면 변화 없음).
- 관계 패널 표시명이 등급 무관 실명 노출하던 것을 뷰어 등급 게이트(닉네임→실명→코드네임 폴백)로 교체. 본인 dossier GM 승격은 자기 캐릭터 데이터에만 적용되고 제3자 이름에는 뷰어 실등급 적용.
- 검증: 마스킹 매트릭스 216 조합(E-8) + 드랍 계약(E-9) 테스트, validator 재검 PASS, `pnpm typecheck`
- 관련 커밋: `3492c1b`

## 2026-08-04 · 콘텐츠 동기화 · 섹터 C NPC 3인

- 로드리온, 니콜라이 바자로프, 그리고리 페초린의 이름·별칭·등급·인적 정보·Dossier 서술과 제공 초상을 live 신원조회에 반영했다.
- 기존 관계·세션 출현·참조 사건과 공개·조직 상태를 보존하고, 세 초상은 투명 배경의 기존 고해상도 최적화 WebP를 사용했다.
- 검증: NPC 승인 원장·payload dry-run, live DB exact re-read, 프로덕션 초상 `200 image/webp`, 인증된 `/erp/personnel` 목록과 세 상세 Dossier, 브라우저 콘솔 경고·오류 0건
- 관련 커밋: `512e3218`, `f730f952`

## 2026-08-05 · 기능 변경 · 세션별 성격 관찰 누적

- 세션 대사·묘사·행동에서 확인한 성격 근거를 불변 ID, 세션, 성향, 출처, 신뢰도와 함께 `lore.personalityObservations`에 누적하고 Dossier 프로필에서 근거 유형별로 표시한다.
- 동일 ID 재동기화는 멱등 no-op으로 처리하고, 같은 ID의 다른 내용·candidate 적용·배열 교체·우회 mutation·companion mutation을 차단한다. 기존 character payload 재적용도 누적 관찰을 보존한다.
- 일반 캐릭터/VTT DTO에서는 원문 근거를 제거하고 Personnel profile clearance만으로 노출한다. owner SSR/polling 권한과 polling 후 작전보고서 링크도 같은 데이터 계약으로 맞췄다.
- 검증: 관련 테스트 74건, lore checker 6건, durable payload 105파일/601건 parse dry-run, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review. 라이브 DB write는 실행하지 않았다.
- 관련 커밋: `fbbf167e`

## 2026-08-05 · 기능 변경 · 구조화 작전 보고서 역참조

- Dossier의 관련 작전 보고서를 본문 키워드 추정 대신 `relatedPersonnelCodenames` 명시 참조로 연결했다.
- 보고서가 참조 중인 인물의 코드네임 변경·비공개 전환·삭제는 원자적 참조 잠금과 `409`로 차단해 끊어진 링크를 방지한다.
- 검증: shared-db 참조 무결성 테스트, API 계약 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`, 인증된 상세 화면 확인
- 관련 커밋: `a57ecd94`

## 2026-08-07 · 기능 변경 · 사망 인원 기록 아카이브

- 확정 사망만 `lifeStatus: DECEASED`로 구조화하고, 필드가 없는 기존 인원은 생존으로 추론하지 않는 계약을 추가했다.
- 목록에서는 현역 인원 아래 회색 `ARCHIVED PERSONNEL` 영역으로 분리하고, 상세 Dossier에는 흑백 초상·사망 확정일·근거 작전 보고서를 표시한다. 사망 인원은 COMMANDER와 현직 책임자 집계에서 제외한다.
- 세션 로그로 확정된 5명(로드리온, 페초린, 게라쉬모프, 퍼크슈타인 에스홀, 닥터 모스)의 spec과 멱등 payload를 작성했다. 라이브 DB write는 실행하지 않았다.
- 검증: shared-db schema 159건, lore 전체 감사와 NPC 승인 게이트, payload live read-only dry-run, `pnpm typecheck`, `pnpm lint`, `pnpm build`, 인증된 데스크톱·모바일 목록/상세 브라우저 확인, critical risk review
- 관련 커밋: `daa34eb8`

## 2026-08-07 · 버그 수정 · 사망 아카이브 집계 및 데이터 계약

- 명시적 사망 인원을 조직도의 `HEADCOUNT`·등급 분포와 직속·하위 조직의 `AGENT`/`NPC` 현역 집계에서 제외하고 아카이브 건수로만 분리했다.
- `lifeStatus`·`lifeStatusAt`·`lifeStatusEventId`가 최종 문서에서 모두 함께 존재하거나 모두 없도록 검증하고, 목록 projection에서는 상세 Dossier만 사용하는 근거 사건 ID를 제외했다.
- 아카이브와 사망 스탬프의 협폭 보정을 viewport가 아닌 실제 `personnel` 컨테이너 폭 기준으로 전환했다.
- 검증: shared-db schema 162건, 대상 회귀 테스트 31건, NPC 승인 게이트, payload live read-only dry-run, `pnpm typecheck`, `pnpm lint`, `pnpm build`, 인증된 820px·590px·580px 브라우저 확인, critical risk review
- 관련 커밋: `aaafb429`
- 후속 작업: 별도 라이브 실행 승인 후 사망 인원 5명 payload 적용·DB 재조회·상세 보고서 링크 확인

## 2026-08-07 · 기능 변경 · Dossier 보고서 열람 등급

- Dossier의 관련 작전 보고서 링크를 뷰어 역할별로 필터링해 권한 미달 보고서의 제목·사건 연결을 노출하지 않는다.
- 비공개 인물을 참조하는 보고서는 GM 전용으로 제한해 인물 공개 범위와 역참조가 어긋나지 않게 검증한다.
- 검증: app 19건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `1949c42d`

## 2026-08-10 · 로어 동기화 · 신규 연구 지휘부와 러시아 정부

- 이르마 코흐를 외부 광명회 수장, 닥터 제노를 닥터 모스 후임 연구 기구 사무차장으로 정의하고 비공개·빈 초상 create-only Dossier payload를 준비했다.
- 군부 조직도에 미국과 같은 정적 하위 조직 문법의 `RUSSIA` 분기와 전용 아이콘을 추가했다. 별도 faction·institution·호감도 DB 레코드는 만들지 않는다.
- 기존 공개·사망·무등급·초상을 보존하면서 게라쉬모프의 표시명·영문명·러시아 정부 소속과 관련 공개 서술을 exact CAS로 맞추는 focused repair를 준비했으며, live DB에는 적용하지 않았다.
- 검증: 조직 분기 테스트 1건, 아이콘 감사 113종·37 route, NPC/성격 checker, 게라쉬모프 live read-only dry-run 단일 `예상 update`, `pnpm typecheck`, 대상 ESLint, critical risk review
- 관련 커밋: `4435a8be`, `cabc04ba`
- 후속 작업: 별도 live 승인과 적용 후 DB 재조회가 필요하다. 인증 브라우저 확인은 `localhost:3000`을 다른 프로젝트가 점유한 로컬 충돌을 해소한 뒤 진행한다.

## 2026-08-10 · 라이브 적용 · 닥터 제노와 게라쉬모프

- 이르마 코흐와 닥터 제노의 create-only payload를 개별 파일로 분리하고, 이번 승인에서는 이르마 생성을 제외했다.
- 닥터 제노를 닥터 모스 후임 연구 기구 사무차장 `V`로 비공개·빈 초상 생성했다. 모스·마가렛·해쉬·피펫 관계 4건, 세션 출현 1건, 불변 성격 관찰 1건을 함께 재조회했다.
- 게라쉬모프의 공개·사망·초상·외부 무등급과 기존 사건·관계를 보존하면서 표시명을 `미하일 게라쉬모프`, 소속을 `MILITARY / RUSSIA`로 live 보정했다.
- 검증: `DOCTOR_ZENO` `_id=6a79450ce0f247419e0c7012`, `GERASIMOV` `_id=6a7587a61bc9225fc2395022`, `IRMA_KOCH` 0건, ingestion run 2건 `succeeded`, 게라쉬모프 사후 dry-run `예상 unchanged`, critical risk review
- 관련 커밋: `aa591272`
- 후속 작업: 이르마는 58×57 대화 아바타 대신 별도 원본 초상을 받을지, 빈 초상으로 생성할지 결정한다. 인증 브라우저 검증은 `localhost:3000` 포트 충돌 해소 뒤 진행한다.

## 2026-08-10 · 보안 개선 · 게스트 Dossier 투영

- 게스트 상세 API와 페이지가 `U` 공개 필드만 남기는 전용 투영을 사용해 소유자 ID, 등급 override, 원본 출처와 일괄 갱신 메타를 제거한다.
- 관련 작전 보고서는 게스트에게 조회·직렬화하지 않으며 공개 Dossier 본문과 관계 링크는 기존 등급 마스킹을 유지한다.
- 검증: 실제 게스트 공개 Dossier API/RSC의 운영 메타·보고서 링크 비노출, 데스크톱 상세 화면 가로 넘침·콘솔 오류 0건, 집중 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `2df03010`

## 2026-08-10 · 라이브 적용 · 이르마 코흐 Dossier

- 사용자 제공 현재 초상을 원본 비율과 투명도를 보존한 1086×1448 WebP로 배포하고, 이르마 코흐를 `HOSTILE / AHNENERBE` 외부 무등급·비공개 Dossier로 생성했다. 1944년 참고 초상은 공개 자산이나 live 필드에 연결하지 않았다.
- 비공개 Dossier에 오틸리아·타이거298 source-side 관계 2건, 변곡점 1부 세션 출현 1건, 불변 성격 관찰 1건을 함께 반영했다.
- 검증: committed clean snapshot dry-run, transaction 후 schema 재조회, production 정적 자산 원본 SHA-256 일치, 인증된 상세·관계·세션 화면, 초상 natural 320×426/rendered 238×317, broken image 0, console warning/error 0, 미인증 상세 `307`·API `401`
- 관련 구현 커밋: `1acea89c`

## 2026-08-10 · 라이브 적용 · S1E6 공개 Dossier 연결

- 기존 공개 Dossier 16건에 `NOSB-S1E6-TURNING-POINT-PART1` 세션 출현과 event ID를 각 1회 누적하고, 7개 관계 envelope의 관계 객체 8개와 불변 성격 관찰 7건을 반영했다.
- BAZAROV 상세에서 보고서 역링크, 수메르 구조 증원 appearance, INDEXER 관계와 `관료 공백에서의 과학자 개입` 관찰을 확인했다.
- 비공개 `IRMA_KOCH`·`DOCTOR_ZENO`와 기존 `WHITE_ROSE_R`은 이번 publication에서 수정하지 않았다.
- 검증: 16개 Dossier DB exact 재조회, appearance 16·관계 객체 8·personality 7 중복 0, 인증된 상세 3개 탭과 정규 링크 확인
- 관련 적용 소스 커밋: `1acea89c`

## 2026-08-13 · 로어 동기화 준비 · 갈로글라·욤스비킹 인물

- 신원조회 조직도에 `GALLOGLA / 갈로글라`와 `JOMSVIKING / 욤스비킹`을 `MILITARY` 산하 외부 군사조직으로 추가했다. 두 조직은 MANUS 섹터나 별도 faction·institution DB 레코드가 아니다.
- 네베드 미니세션에서 확인된 개럿·사이먼·코너 등 외부 무등급 공개 Dossier 11건의 create-only payload를 준비했다. `SIMON_OCALLAHAN`·`NOSTER`만 사망 증거 3필드를 저장하고 나머지 9명은 생사를 추정하지 않으며, 모두 공용 미상 인물 초상을 사용한다.
- 검증: spec↔payload adapter parity 11/11, live read-only dry-run 11건 `예상 insert`, NPC·public prose·visual·coverage 검사, 외부 조직 테스트 2건, `pnpm typecheck`, 대상 ESLint, 인증된 1280px 조직도·가로 넘침·콘솔 오류 확인, critical risk review
- 관련 구현 커밋: `1ffb0ba9`
- 운영 경계: 신규 Dossier와 보고서 staging/publication은 live에 적용하지 않았다. exact 운영 승인 뒤 신규 11건 생성·재조회 → staging → publication 순서로 실행한다.

## 2026-08-13 · 조직도 보강 · 외부 전사 조직 전용 문장

- 군부 공용 표식을 재사용하던 갈로글라와 욤스비킹에 각각 켈트 매듭·장병도끼, 원형 방패·창 문장을 적용했다.
- 조직도 inline 아이콘과 공개 SVG mirror, NOVUS 아이콘 마스터를 같은 도형으로 동기화했다.
- 검증: 외부 조직·SVG parity 테스트 3건, 아이콘 감사 115종·37 route, master JS syntax, `npx tsc --noEmit`, 대상 ESLint, 인증된 1280px 신원조회 실제 렌더·가로 넘침·콘솔 오류 확인
- 관련 구현 커밋: `ba3d8973`

## 2026-08-13 · 라이브 적용 · 네베드 미니세션 외부 인물

- 개럿·사이먼·코너 등 공개 외부 Dossier 11건을 생성해 갈로글라 9명·욤스비킹 2명으로 분류했다. 외부 인물에는 agentLevel을 저장하지 않았고 사이먼·노스터만 사망 archive에 배치했다.
- 기존 공개 Dossier 11건에는 `NOSB-MINI-NEVED` 세션 출현과 event/tag를, 네베드·샌드맨에는 불변 성격 관찰을 각각 1회 반영했다.
- 검증: create run `seed-payload:7c6c66b6-9568-49ba-ba8e-017b3f79e645` 11/11, publication run `seed-payload:e558d44d-70d0-4420-8279-afeeec1f55fb` 15/15, DB exact 재조회, 인증된 조직도·신규/사망 Dossier·보고서 역링크·가로 넘침·콘솔 오류 확인
- 관련 적용 소스 커밋: `1ffb0ba9`, `ba3d8973`

## 2026-08-13 · 문장 재설계 · 생성 원화 기반 외부 전사 조직

- 수제 조합형이던 갈로글라·욤스비킹 아이콘을 이미지 생성으로 만든 켈트 매듭 스파스와 방패열 용두 장선 원화에서 추출한 단색 벡터 문장으로 교체했다.
- 배경과 미세 장식을 제거한 뒤 24px에 맞춰 단순화했으며, 조직도 inline source·공개 SVG mirror·NOVUS 아이콘 마스터가 같은 `currentColor` 도형을 사용하도록 유지했다.
- 검증: 24px 래스터 미리보기, 인증된 1280px 신원조회 실제 18–20px 렌더, 외부 조직·SVG parity 테스트 3건, 아이콘 감사 115종·37 route, master JS syntax, `npx tsc --noEmit`, 대상 ESLint
- 관련 구현 커밋: `a3ade187`

## 2026-08-13 · 성능 최적화 · 조직 카드 화면 밖 렌더 지연

- 조직 drill-down의 인원·권한·검색 결과는 모두 DOM에 유지하고 화면 밖 Dossier 카드의 최초 layout·paint만 지연했다.
- 검증: JTEST 알파 섹터 17건의 첫·마지막 카드 `content-visibility: auto`와 끝 스크롤 렌더, 집중 테스트·타입 검사·lint·production build
- 관련 커밋: `76845d44`

## 2026-08-17 · UI 개선 · 외부 하위 조직 카드

- 조직도 2열에서 시민사회 그룹이 군부 그룹 높이까지 늘어나던 정렬을 해제해 백장미단과 스페이스 제로 카드가 각 콘텐츠 높이만 차지하도록 했다.
- 시민사회 카드의 코드·인원 강조색을 흰색으로 통일하고, 군부·시민사회 하위 화면은 신원조회 기본 골드 팔레트를 유지했다.
- 검증: `pnpm typecheck`, `pnpm lint`, 인증된 `localhost:43849`의 1800×1200·1280×1000·700×1000 조직도 레이아웃과 USA·화이트로즈·스페이스제로 하위 화면, 가로 넘침·브라우저 콘솔 오류 없음
- 관련 커밋: `f895f5a4`
