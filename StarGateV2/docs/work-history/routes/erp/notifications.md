# /erp/notifications

## 2026-07-30 · 기능 추가 · 대상 사용자 실시간 알림

- 새 알림은 대상 사용자 Query만 무효화하고 다른 사용자의 notification Query는 건드리지 않는다.
- `primary + connected`에서는 기존 60초 polling을 중지하고 장애 중에만 재개한다.
- 최초 로드 과거 알림은 띄우지 않으며 새 알림만 접근 가능한 6초 toast로 표시한다.
- 검증: worker 대상 socket 테스트, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `586cc62`, `bba8924`
