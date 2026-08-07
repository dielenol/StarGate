# /erp/personnel

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
