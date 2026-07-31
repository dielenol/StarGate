# /erp/wiki/[id]

## 2026-07-30 · 기능 변경 · 상세 Query와 동시 편집 보호

- 위키 상세 본문을 detail Query로 전환해 외부 수정 신호 뒤 최신 문서를 다시 렌더한다.
- 편집 중에는 로컬 입력을 보존하고 `expectedUpdatedAt` CAS가 어긋나면 `409 STALE_VERSION`과 최신본 불러오기를 제공한다.
- 기존 문서에 `updatedAt`이 없어도 `null` 버전으로 첫 CAS 저장이 가능하며 DB backfill은 하지 않았다.
- 검증: shared-db CAS 26건, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-07-31 · 성능 최적화 · 자동링크 참조 조회 경량화

- 자동링크/연관 문서용 컬렉션 4종(위키·캐릭터·아이템·보고서) 전체 로드를 ref 프로젝션(본문·시트 전문·play 제외)으로 교체 — 서버 메모리/DB 대역 절감, 링크·연관 카드 결과는 등가성 테스트로 동일 보장.
- 문서 본문 직렬 조회를 참조 조회들과 Promise.all로 병렬화.
- 검증: auto-link/연관 매칭 ref 등가성 테스트 11건, `pnpm build`
- 관련 커밋: `a174e28`
