# /erp/notifications

## 2026-07-30 · 기능 추가 · 대상 사용자 실시간 알림

- 새 알림은 대상 사용자 Query만 무효화하고 다른 사용자의 notification Query는 건드리지 않는다.
- `primary + connected`에서는 기존 60초 polling을 중지하고 장애 중에만 재개한다.
- 최초 로드 과거 알림은 띄우지 않으며 새 알림만 접근 가능한 6초 toast로 표시한다.
- 검증: worker 대상 socket 테스트, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `586cc62`, `bba8924`

## 2026-07-31 · 기능 추가 · 복권 결과 개인 알림

- 미스터비스트 복권 결과 공개와 같은 transaction에서 당첨 또는 꽝 개인 알림을 한 번만 생성한다.
- 캐릭터 소유권이 변경된 진행 중 복권은 현재 소유자에게 감사 이력을 남기며 이관하고, 알림도 현재 소유자에게 전달한다.
- 검증: 복권 집중 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- 관련 커밋: `e733a98`

## 2026-07-31 · 성능 최적화 · 알림 폴링 304 재검증

- 알림 목록/요약 GET에 ETag/304 도입 — 전 ERP 페이지 공통 60초 폴링에서 데이터 불변 시 응답 바디 0B.
- 검증: http-cache 단위 테스트, `pnpm build`
- 관련 커밋: `0390f80`
