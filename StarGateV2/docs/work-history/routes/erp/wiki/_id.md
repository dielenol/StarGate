# /erp/wiki/[id]

## 2026-07-30 · 기능 변경 · 상세 Query와 동시 편집 보호

- 위키 상세 본문을 detail Query로 전환해 외부 수정 신호 뒤 최신 문서를 다시 렌더한다.
- 편집 중에는 로컬 입력을 보존하고 `expectedUpdatedAt` CAS가 어긋나면 `409 STALE_VERSION`과 최신본 불러오기를 제공한다.
- 기존 문서에 `updatedAt`이 없어도 `null` 버전으로 첫 CAS 저장이 가능하며 DB backfill은 하지 않았다.
- 검증: shared-db CAS 26건, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`
