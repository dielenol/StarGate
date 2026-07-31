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
