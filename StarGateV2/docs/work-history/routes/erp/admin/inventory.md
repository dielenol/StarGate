# /erp/admin/inventory

## 2026-07-30 · 기능 변경 · 운용 허브 Query

- 관리자 인벤토리 허브의 캐릭터·품목·공용 인벤토리 집계를 인증된 overview API와 Query로 전환했다.
- 품목 생성과 개인·공용 인벤토리 지급/제거 후 overview 캐시도 함께 갱신한다.
- 검증: `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`
