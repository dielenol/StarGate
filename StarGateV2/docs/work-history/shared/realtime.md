# 공용 ERP realtime

## 2026-07-30 · 기능 추가 · worker 기반 Query invalidation

- `REALTIME_CLIENT_MODE=off|observe|primary`와 `connecting|connected|degraded|disabled` 연결 상태를 추가했다.
- 100ms resource batch, 최근 event ID 256개 중복 방지, 지수 backoff jitter, disconnect/reconnect active Query 재검증을 적용했다.
- 알림과 거래는 대상 사용자 socket에만 공개 resource 신호를 보내고 frame에 사용자 ID나 DB 값을 포함하지 않는다.
- 알림은 최초 이력을 제외하고 최대 3개, 큰 burst는 합산 toast로 6초간 `aria-live="polite"` 영역에 표시한다.
- 운영 상태는 `CODE_READY`이며 live `observe/primary`, DB index/checkpoint, Dokploy/Vercel 설정은 별도 승인 전까지 변경하지 않았다.
- 검증: `pnpm test:worker` 52건, realtime·거래 계약 24건, shared-db CAS 26건, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `586cc62`, `bba8924`

## 2026-08-13 · 성능 최적화 · Query key prefix 병합

- realtime resource가 `['wiki']`와 그 하위 `['wiki', 'lore-search']`를 동시에 반환할 때 상위 key 하나로 합쳐 같은 active Query가 중복 invalidation되지 않게 했다.
- exact key 중복 제거, resource 순서와 기존 prefix invalidation 계약은 유지했다.
- 검증: realtime Query key·client 계약 및 Query 런타임 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- 관련 커밋: `c488f832`

## 2026-08-14 · 기능 확장 · NOVEX Query 동기화

- 시장 상태·공시·계정 설정·기업행동·시즌·성과·시즌 원장 변경을 기존 `stocks` prefix로 묶고, 가격·보유량 변경은 거래 화면도 함께 무효화한다.
- realtime 연결 장애에서는 기존 fallback polling을 유지하고, 사용자별 설정·알림 데이터는 대상 사용자에게만 전달한다.
- 검증: worker realtime 101건 전체 테스트와 웹 Query·거래 계약 테스트
- 관련 커밋: `fb012220`
