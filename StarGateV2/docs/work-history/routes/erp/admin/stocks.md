# /erp/admin/stocks

## 2026-08-09 · 기능 변경 · worker 예약 작업 소유권 표시

- 주식·일일 수당 예약 작업의 자동 소유자를 Vercel cron이 아닌 장기 실행 worker로 표시하고, 웹 cron route는 작업을 명시한 인증 수동 복구 진입점으로만 남겼다.
- 낡은 legacy owner 기본 활성화와 관련 테스트를 제거해 worker와 웹이 같은 slot을 동시에 실행하는 오해를 없앴다.
- 검증: 주식 집중 테스트, 웹 `typecheck`·`lint`·production build, worker 62건, `git diff --check`
- 관련 커밋: `45944a0c`
- 운영 경계: Dokploy schedule·주가·수당 mutation은 실행하지 않았다.
