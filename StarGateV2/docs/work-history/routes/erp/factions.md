# /erp/factions

## 2026-07-30 · 기능 변경 · 관계도와 접촉 기록 Query

- 세력 board와 접촉 로그·의뢰 진행을 인증 read API와 하이브리드 Query로 전환했다.
- 캐릭터·위키·보고서·세력 활동·우호도 변경이 board/activity Query에 반영된다.
- 활동 mutation 후 `router.refresh()` 대신 Query 캐시를 갱신하며 기존 크레딧/우호도 처리 규칙은 유지했다.
- 검증: `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`
