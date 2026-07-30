# /erp/trades

## 2026-07-30 · 기능 변경 · 당사자 실시간 교환

- 거래 변경은 두 당사자 socket에만 전달하고 2.5초 polling은 연결 장애 중에만 사용한다.
- 크레딧·인벤토리·주식·사용자·캐릭터 변경도 거래 복합 응답을 갱신한다.
- 편집 중 원격 revision이 바뀌면 초안을 보존하고 저장을 잠근 뒤 `최신 구성 불러오기`를 제공한다.
- 기존 `expectedRevision` CAS, 멱등 operation, 경제 transaction은 유지했다.
- 검증: worker 대상 socket 테스트, 거래 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `586cc62`, `bba8924`
