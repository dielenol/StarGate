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
