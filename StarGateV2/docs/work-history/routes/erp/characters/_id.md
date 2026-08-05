# /erp/characters/[id]

## 2026-07-27 · 반응형 수정

- 모바일 변경 이력에서 변경 건수와 펼치기 버튼을 전체 너비로 배치했다.
- `REVERT`와 `DELETE` 버튼을 2열로 고정해 버튼 글자가 세로로 깨지는 문제를 막았다.
- 검증: 768px과 390px viewport에서 액션 영역 너비와 문서 가로 넘침을 확인했다.
- 관련 커밋: `eccaa07`

## 2026-07-28 · 기능 추가 · 장착형 어빌리티 강화

- 캐릭터 원본 시트를 수정하지 않고 장착 장비의 어빌리티 효과 대체 정보를 합성하도록 변경했다.
- 인벤토리 Query 갱신에 따라 장비 교체 시 강화 효과가 즉시 적용되거나 원본 효과로 복귀한다.
- 검증: 장착·비장착 resolver 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`, 인증된 로컬 TIGER298 시트에서 ATK 20과 원본 절제 7×5 보존 확인
- 관련 커밋: `75be2ab`

## 2026-07-30 · 기능 변경 · 상세 Query와 동시 편집 보호

- 캐릭터 상세를 기존 detail Query에 연결하고 외부 변경 시 열린 화면을 갱신한다.
- 편집 중에는 로컬 입력을 보존하고 저장을 잠그며, `expectedUpdatedAt` CAS가 어긋나면 `409 STALE_VERSION`과 최신본 불러오기를 제공한다.
- `updatedAt`이 없는 기존 문서는 `null` 버전으로 첫 저장할 수 있어 backfill은 추가하지 않았다.
- 검증: shared-db CAS 26건, realtime/거래 계약 24건, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-08-04 · 기능 추가 · R 궁극기 슬롯

- 캐릭터 생성·편집·관리자 import·상세에 `R` 궁극기 전용 슬롯을 추가하고 상세 카드에서 `ULTIMATE`로 표시한다.
- POST와 owner/admin PATCH에서 모든 어빌리티 슬롯 중복을 차단하며, legacy 시트 이관도 기존 7슬롯 위치 의미를 보존한 채 공식 12슬롯까지 확장한다.
- 라이브 TIME/크로노스의 `A5 · code R` 능력을 내용 변경 없이 `R · code R`로 이관했다.
- 검증: 관련 테스트 59건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, payload CAS dry-run 및 쓰기 후 DB 재조회 통과
- 브라우저 확인: 인증된 로컬 크로노스 상세에서 `ABILITY · R`, `ULTIMATE`, `11 / 12 SLOTS`와 기존 능력명 렌더링 확인
- 관련 커밋: `da2c2e3f`

## 2026-08-05 · 버그 수정 · 보고서 인물 참조 보존

- 작전 보고서가 참조 중인 캐릭터는 코드네임 변경·비공개 전환·삭제를 수행할 수 없으며 API가 충돌 이유를 `409`로 반환한다.
- 캐릭터 생성 payload를 관리자 허용 필드로 제한해 내부 참조 잠금 메타데이터를 외부 입력으로 주입할 수 없게 했다.
- 검증: shared-db transaction/reference 테스트, character API 계약, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- 관련 커밋: `a57ecd94`
