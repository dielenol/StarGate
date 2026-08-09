# /erp/trades

## 2026-07-30 · 기능 변경 · 당사자 실시간 교환

- 거래 변경은 두 당사자 socket에만 전달하고 2.5초 polling은 연결 장애 중에만 사용한다.
- 크레딧·인벤토리·주식·사용자·캐릭터 변경도 거래 복합 응답을 갱신한다.
- 편집 중 원격 revision이 바뀌면 초안을 보존하고 저장을 잠근 뒤 `최신 구성 불러오기`를 제공한다.
- 기존 `expectedRevision` CAS, 멱등 operation, 경제 transaction은 유지했다.
- 검증: worker 대상 socket 테스트, 거래 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `586cc62`, `bba8924`

## 2026-07-31 · 성능 최적화 · 폴링 폴백 케이던스 완화

- realtime 미가동(off) 동안 상시 가동되는 2.5초 폴링 폴백을 10초로 완화했다 (요청당 DB 왕복 6회 기준 탭당 분당 144→36 ops). realtime primary 전환 시 폴링 자동 해제 구조는 유지.
- staleTime을 1초→5초로 정렬했다.
- 검증: TanStack v5 실런타임 리페치 테스트 5건, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- 관련 커밋: `bce9d0a`

## 2026-07-31 · 성능 최적화 · 카드 메모이제이션과 304 재검증

- 거래 카드(TradeCard)를 React.memo + useCallback으로 안정화 — 10초 폴링에서 데이터 불변 시 카드 리렌더 0 (뮤테이션 즉시 갱신은 invalidate 경로 보존).
- 거래 목록 GET에 ETag/304 재검증 도입 — 데이터 불변 시 응답 바디 0B. 거래 목록/상대 목록 정렬에 보조 키를 추가해 동점 순서 플립(ETag 플랩 + 목록 재정렬) 차단.
- 검증: realtime/http-cache 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- 관련 커밋: `1b3bf56`, `0390f80`

## 2026-08-09 · 기능 확장 · 거래 진행 알림과 원자적 DM

- 거래 생성·제안 revision·당사자 확인·완료·취소를 중앙 workflow 채널에서 거래 ID별로 추적하고, 기존 상대방 DM도 유지한다.
- 자산 정산 transaction 안에서 DM과 workflow outbox를 함께 기록해 거래가 완료됐는데 알림 enqueue 실패로 API가 실패하는 경계를 제거했다.
- 검증: 거래·발주 계약 테스트 16건, worker 62건, 웹 `typecheck`·`lint`·production build, critical risk review
- 관련 커밋: `45944a0c`
- 운영 경계: 라이브 거래 생성·수정·확정·취소와 Discord DM은 실행하지 않았다.
