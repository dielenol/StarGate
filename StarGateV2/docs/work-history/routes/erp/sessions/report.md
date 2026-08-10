# /erp/sessions/report

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
