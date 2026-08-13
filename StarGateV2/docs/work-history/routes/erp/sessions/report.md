# /erp/sessions/report

## 2026-07-01 · 기능 개발 · 보고서 편집

- 상세에서 편집 화면으로 이동하고 PATCH mutation으로 보고서를 수정하도록 연결했다.
- 지도 위치·좌표 삭제와 공백 입력 정규화를 보강하고 미니세션 번호 체계를 분리했다.
- 참여자 링크는 별칭·원어명까지 비교하는 공용 인물 매칭을 사용하도록 변경했다.
- 검증: PATCH 입력 검증, DB unset과 참여자 링크 매칭 변경을 대조했다.
- 관련 커밋: `565c80f`, `5adfbda`, `a8a8d2d`, `5a62ef7`

## 2026-07-06 · 링크·이미지 렌더 수정

- 명시 링크의 bracket label과 보고서 링크 파싱을 보강했다.
- 보고서 이미지를 원본 비율 contain과 흐린 배경으로 표시하고 지도 라벨 겹침을 수정했다.
- 검증: 링크 렌더러와 보고서 이미지·지도 CSS 변경을 커밋 diff로 확인했다.
- 관련 커밋: `fa0806d`

## 2026-07-15 · 인물 링크 매칭 수정

- 5화 보고서의 인물 링크가 정식 이름·별칭을 안정적으로 찾도록 공용 매칭을 보강했다.
- 검증: lore link 후보 매칭 단위 테스트를 확인했다.
- 관련 커밋: `a8c72d1`

## 2026-07-27 · 반응형 수정

- 모바일에서도 지도와 표적 카드의 원본 비율을 유지하도록 지도 stage 최소 너비를 고정했다.
- 좁은 화면에서는 지도 영역만 가로 스크롤해 겹치거나 잘리지 않고 전체 표적을 확인할 수 있게 했다.
- 검증: 1482px, 1280px, 768px, 390px viewport와 지도 scroll 영역을 확인했다.
- 관련 커밋: `8577453`

## 2026-07-30 · 기능 변경 · 보고서 상세 Query와 CAS

- 보고서 상세 본문과 전개 기록을 detail Query에 연결했다.
- 편집 중 외부 수정은 입력을 폐기하지 않고 저장을 잠그며 `expectedUpdatedAt` 불일치는 `409 STALE_VERSION`으로 처리한다.
- 검증: shared-db CAS 26건, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-07-31 · 성능 최적화 · 상세 참조 조회 경량화

- 보고서 상세의 캐릭터/아이템/보고서 참조를 ref 프로젝션으로 교체 (위키는 본문 content 매칭이 판정 입력이라 의도적으로 full 유지 — 연관 위키 카드 결과 보존).
- 검증: 연관 매칭 등가성 테스트(content 의존 입증 포함), `pnpm build`
- 관련 커밋: `a174e28`

## 2026-07-31 · 버그 수정 · 상세 실명 마스킹 적용

- 자동링크·참여 인원·관련 인물 경로가 캐릭터 실명을 등급 무관 평문 노출하던 것을 위키 상세와 동일한 clearance 마스킹으로 통일 (clearanceOverrides 존중, 2026-07-31 정책 확정). G 미만 등급은 실명 대신 닉네임/[CLASSIFIED] 표기.
- 연관 위키 후보를 visibleWikiPages 로 제한 — 비공개 문서 제목의 연관 카드 노출 차단 (GM 동작 불변).
- GM 이 본문에 직접 쓴 participants 원문 문자열은 그대로 유지 (DB 조인 표시만 게이트).
- 검증: 마스킹 후 연관 매칭 생존 테스트(appearsInEvents/codename/닉네임), validator 재검 PASS
- 관련 커밋: `3492c1b`

## 2026-07-31 · 성능 최적화 · 본문 마크다운 메모이제이션

- 보고서 본문 renderMarkdown을 useMemo로 전환 — 60초 폴링 tick마다 재파싱하던 것 제거 (위키 상세와 동일 패턴).
- 검증: `pnpm build`
- 관련 커밋: `1b3bf56`

## 2026-08-05 · 기능 변경 · 구조화 로어 참조와 출처 무결성

- 보고서 작성·편집에 관련 위키, 인물, 카탈로그를 안정 식별자로 선택하는 구조화 참조 필드를 추가하고 상세 화면의 링크·역참조를 같은 데이터로 통일했다.
- 등록 세션 보고서는 세션 제목 SSOT와 1:1 identity를 강제하고, 중복 생성·참조 대상 변경·원본 세션 삭제를 transaction lock과 `409`로 차단한다.
- repository seed 출처는 커밋·content hash에 고정하며 historical provenance backfill은 domain/economy payload를 재실행하지 않는 전용 도구로 분리했다.
- 검증: shared-db 전체 테스트 256건, 변경 app/script 테스트 77건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `a57ecd94`
- 후속 작업: live unique/backlink index와 historical provenance 적용은 별도 운영 승인 후 진행한다.

## 2026-08-06 · 기능 변경 · S1E5 악 2부 보고서 지원

- S1E5 악 2부를 정규 보고서 `05.5`로 식별하는 ID preset과 제목 fallback을 추가했다.
- 같은 섹터 C 좌표를 쓰는 `05`와 `05.5` 지도 카드가 겹치지 않도록 좌우 배치를 분리했다.
- 보고서·wiki·Dossier·성격 관찰 dry-run payload와 장면 자산 15종을 준비했으며, live DB에는 적용하지 않았다.
- 검증: 번호·구조화 참조·로어 링크 테스트 19건, 전체 lore static audit, payload 3종 DB dry-run, `pnpm typecheck`, `pnpm lint`, critical risk review
- 관련 커밋: `ff37a111`
- 후속 작업: 신규 wiki·시각 자산 공개 범위 승인, NPC apply-ready gate 해소, live 적용·DB 재조회·인증 브라우저 검증이 필요하다.

## 2026-08-06 · 버그 수정 · 외부 NPC 등급 표기

- 관련 인물 카드에서 권한등급이 없는 외부 NPC를 `NPC · U`로 오표시하지 않고 `NPC`로만 표시한다.
- 내부 등급이 있는 인물은 기존 `NPC · H` 형식을 그대로 유지한다.
- 검증: 연관 인물 링크 테스트 12건, `pnpm typecheck`, `pnpm lint`, critical risk review
- 관련 커밋: `3454ae58`
- 후속 작업: 해당 revision 배포 뒤 외부 NPC가 연결된 보고서 상세를 인증 브라우저에서 확인한다.

## 2026-08-07 · 기능 변경 · 작전 보고서 열람 등급

- 작전 보고서에 `minRole`을 추가하고 목록·상세·편집·API에서 뷰어 역할에 따라 존재 여부를 숨기도록 통일했다.
- 위키·카탈로그·Dossier 역참조와 통합 Lore Explorer도 같은 역할 필터를 적용하며, 비공개 참조 대상은 보고서 공개 범위를 초과할 수 없게 검증한다.
- 검증: shared-db 11건(2건 skip), app 19건, projection 11건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `1949c42d`

## 2026-08-07 · 로어 동기화 · MINI05 로맨티드

- 미니세션 `로맨티드`를 정규 보고서 `MINI05`로 식별하고 보고서·wiki·Dossier·관계·성격 관찰 payload와 장면 자산 8종을 준비했다.
- 신규 보고서는 라이브 공개 전까지 V 이상만 열람하도록 staging했으며, live DB에는 적용하지 않았다.
- 검증: PDF 145페이지/1,847레코드 추출, lore 전체 감사, schema corpus 11건, 참조·Dossier·관계·성격 관찰 read-only dry-run
- 관련 커밋: `e3fe81ae`
- 후속 작업: `book-810`, `key-shaped-bookmark` 참조 대상을 먼저 live 반영한 뒤 보고서·mirror 적용, DB 재조회, 역할별 인증 브라우저 검증이 필요하다.

## 2026-08-10 · 로어 동기화 · S1E6 변곡점 1부

- S1E6 변곡점 1부를 정규 보고서 `06`으로 식별하고 지도 표적 위치를 추가했다.
- V 이상 보고서·비공개 mirror·비공개 마지막 대대 문서를 staging하고, U 공개 시 기존 wiki·Dossier·관계·성격 관찰을 한 transaction에서 반영하는 payload를 분리했다.
- 보고서와 mirror에 같은 순서로 쓰는 장면 자산 15종을 추가했으며, live DB에는 적용하지 않았다.
- 검증: PDF 125페이지/1,464레코드 추출, 번호 테스트 6건, 3파일 41-envelope schema, NPC·성격·시각자료 parity, 전체 lore static audit, `pnpm typecheck`, 대상 ESLint, critical risk review
- 관련 커밋: `27dc9e9f`
- 후속 작업: 신규 NPC 2명과 리처드/R 동일인 여부를 결정한 뒤, 별도 live 승인으로 V staging과 U publication을 순서대로 적용하고 DB 재조회·역할별 인증 브라우저 검증을 진행한다.

## 2026-08-10 · 로어 동기화 보강 · 이르마 코흐와 닥터 제노

- 이르마 코흐를 아넨에르베 광명회 수장인 외부 무등급 NPC로, 닥터 제노를 사망한 닥터 모스의 후임 연구 기구 사무차장 `V`로 확정했다.
- 두 Dossier는 빈 초상·비공개 상태로 최초 관계·세션 출현·불변 성격 관찰을 함께 넣는 create-only staging payload로 분리했다. 성공 뒤 같은 파일 재실행은 fail-closed이며 후속 보정은 focused update만 허용한다.
- 보고서와 프로젝트 데드 핸드 mirror의 제노 관련 서술을 후임 인사 결정에 맞췄으며, live DB에는 적용하지 않았다.
- 검증: spec adapter parity 3건, NPC·성격·시각자료·공개 문구 checker, live read-only dry-run `예상 insert` 2건, `pnpm typecheck`, critical risk review
- 관련 커밋: `4435a8be`
- 후속 작업: 별도 live 승인 후 비공개 마지막 대대 → V 보고서·mirror → 신규 NPC 2명 순서로 staging하고, 각 단계 DB 재조회 뒤 U publication을 별도 승인받는다.

## 2026-08-10 · 라이브 적용 · S1E6 V staging

- `last-battalion`을 비공개 wiki로, `NOSB-S1E6-TURNING-POINT-PART1`을 `minRole: V`·보고 순번 `06`으로, `s1e6-turning-point-part1` mirror를 비공개로 live staging했다.
- 보고서와 mirror의 장면 참조는 각각 15개로 재조회했고, 이번 단계에서는 U 공개 publication과 기존 공개 wiki·Dossier 역방향 링크를 실행하지 않았다.
- 검증: wiki `_id=6a7944ca7c80e35d939e1fdb`, report `_id=6a7944f37c80e35d939e1fdd`, mirror `_id=6a7944f37c80e35d939e1fde`, ingestion run 3건 `succeeded`, DB exact re-read, U publication 38건 live dry-run, critical risk review
- 관련 커밋: `aa591272`, `89584ba6`, `0c6a6a7a`
- 후속 작업: 이르마 초상/생성 결정, 리처드와 `WHITE_ROSE_R` 동일인 결정, U publication 별도 승인, `localhost:3000` 포트 충돌 해소 뒤 역할별 인증 브라우저 검증이 남는다.

## 2026-08-10 · 보안 개선 · 게스트 회원 전용 보고서 차단

- 계정 없는 게스트에게 작전 보고서 목록은 빈 상태로, 상세는 `404`로 제공해 `authenticated` 보고서의 제목·본문·참가자 정보를 숨긴다.
- 통합 검색과 위키·Dossier·카탈로그 역참조에서도 게스트 보고서를 제외해 우회 경로를 함께 차단했다.
- 검증: 게스트 공개 경계 집중 테스트, 실제 게스트 목록 0건·상세 404·검색 결과 0건, 데스크톱·390×844 빈 상태와 콘솔 오류 0건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `2df03010`

## 2026-08-10 · 라이브 적용 · S1E6 변곡점 1부 U 공개

- `NOSB-S1E6-TURNING-POINT-PART1` 보고서를 `V`에서 모든 인증 역할 `U`로 전환하고 목록에 정규 보고서 `06`으로 공개했다.
- 공개 mirror와 `last-battalion`, 기존 위키 5건, 공개 Dossier 16건의 세션 출현·관계·성격 관찰을 38-envelope 단일 transaction으로 함께 반영했다.
- 검증: ingestion run `seed-payload:099d584a-ffc7-4990-a8c2-f154a8a18f79` 38/38 성공, DB exact 재조회, 목록·상세·역참조, 시각 자료 15개 natural/rendered `1035×503`·broken 0, 미인증 상세 `307`
- 관련 적용 소스 커밋: `1acea89c`
- 잔여 관찰: 최초 보고서 목록 진입에서 렌더를 막지 않는 React hydration `#418`이 1회 기록됐고 상세·mirror 탐색에서는 새 앱 오류가 없었다.

## 2026-08-12 · 로어 동기화 · MINI06 전사의 탄생

- 네베드 미니세션 전·후편을 하나의 `NOSB-MINI-NEVED` 보고서와 `mini06-neved` wiki mirror로 통합하고, 보고 순번 `MINI06`과 지도 카드 배치를 추가했다.
- 같은 순서로 쓰는 장면 자산 12종, 기존 공개 Dossier 11건의 세션 출현, 네베드·샌드맨 성격 관찰 2건을 publication payload로 준비했다.
- 세션상 현장 전원의 200,000 크레딧 즉시 지급은 정사로 기록했지만 exact ERP 수령자·계정·기존 ledger 반영 여부가 확인되지 않아 경제 mutation은 제외했다. `TIME`의 소다 1개 소비도 별도 검토로 남겼다.
- 검증: 번호 테스트 9건, personality 테스트 8건, NPC·성격·시각·공개 문구·report/mirror parity·전체 lore static audit, live read-only dry-run staging 2건과 publication 15건, `pnpm typecheck`, `pnpm lint`, 자산 audit·테스트 11건, critical risk review
- 관련 커밋: `44e73cd3`
- 후속 작업: 별도 live 승인 뒤 V/private staging → DB 재조회 → fresh U/public publication dry-run·실행 → 역할별 보고서·mirror·Dossier·이미지 consumer 검증을 진행한다. 신규 NPC 후보 14건과 경제 원장 보정은 필요한 사용자 결정을 별도로 받는다.

## 2026-08-13 · 라이브 적용 · MINI06 전사의 탄생

- `NOSB-MINI-NEVED`를 `V`로 staging한 뒤 모든 인증 역할 `U`로 공개하고, 보고 순번 `MINI06`과 personnel 22건·wiki 2건·catalog 1건의 구조화 참조를 반영했다.
- 보고서와 `mini06-neved` mirror는 같은 장면 12개를 사용하며, 현장 전원의 200,000 크레딧 즉시 지급은 정사 문장으로만 보존하고 경제 원장은 변경하지 않았다.
- 검증: staging run `seed-payload:b538040a-301c-4d9f-a288-84f49b37f55a` 2/2, publication run `seed-payload:e558d44d-70d0-4420-8279-afeeec1f55fb` 15/15, DB exact 재조회, 인증된 목록·상세·역참조, 이미지 parity·broken 0·가로 넘침·콘솔 오류 0, 미인증 상세 `307`
- 관련 적용 소스 커밋: `44e73cd3`, `1ffb0ba9`
