# /erp/factions

## 2026-07-30 · 기능 변경 · 관계도와 접촉 기록 Query

- 세력 board와 접촉 로그·의뢰 진행을 인증 read API와 하이브리드 Query로 전환했다.
- 캐릭터·위키·보고서·세력 활동·우호도 변경이 board/activity Query에 반영된다.
- 활동 mutation 후 `router.refresh()` 대신 Query 캐시를 갱신하며 기존 크레딧/우호도 처리 규칙은 유지했다.
- 검증: `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-07-31 · 성능 최적화 · 소속 인원 참조 경량화

- 세력 보드의 캐릭터 전체 로드를 소속 버킷 필드만의 ref 프로젝션으로 교체 (위키/보고서는 본문 키워드 카운트가 판정 입력이라 full 유지).
- 검증: `pnpm build`, 기존 화면 구성 등가
- 관련 커밋: `a174e28`

## 2026-08-05 · 기능 변경 · 동적 조직 로어 연결

- 정적 세력 fixture를 DB의 세력·기관·인물·위키·작전 보고서에서 조합한 동적 조직 데이터로 교체했다.
- 보고서와 위키의 명시적 참조를 우선 사용해 세력 활동과 연관 로어가 문자열 우연 일치에 의존하지 않도록 했다.
- 검증: 관련 계약 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`, 인증된 데스크톱·390px 읽기 전용 브라우저 확인
- 관련 커밋: `a57ecd94`
- 후속 작업: auxiliary lore index와 projection의 라이브 적용은 별도 운영 승인 후 진행한다.
