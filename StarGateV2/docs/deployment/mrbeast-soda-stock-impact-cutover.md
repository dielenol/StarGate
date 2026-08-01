# 미스터비스트 소다 → STM 주가 연동 배포 런북

이 기능은 소다 결제 수량을 demand 원장에 먼저 기록하고, 다음 자동 정기 시세에서 STM에 1개당 `+0.10%p`, 1회 최대 `+5.00%p`를 더한다. 이벤트 판매 인정 기간은 이벤트 시작 시각부터 최대 14일이며 종료 시각은 포함하지 않는다.

라이브 DB backfill, 환경변수 변경, 배포와 자동 시세 실행은 각각 라이브 mutation이다. 실행 전 정확한 대상 환경과 변경 내용을 다시 확인한다.

## 컷오버 순서

1. Web과 worker 모두 `MRBEAST_SODA_STOCK_IMPACT_TICK_ENABLED=false`로 둔다.
2. checkout dual-write 코드부터 배포한다. 이 상태에서는 신규 판매량은 원장에 쌓이지만 자동 시세가 소비하지 않는다.
3. Web과 worker의 DB 이름이 동일한지 확인한다. `DB_NAME`과 `MONGODB_DB_NAME`을 함께 쓴다면 값이 반드시 같아야 한다.
4. 읽기 전용 dry-run을 실행해 이벤트, 구매자 수, 총판매량, 기존 원장 수량을 확인한다.
   - `pnpm backfill:mrbeast-soda-stock-impact`
5. tick이 계속 비활성임을 확인한 뒤 backfill을 실행한다.
   - `pnpm backfill:mrbeast-soda-stock-impact -- --execute --yes --tick-paused`
6. 스크립트의 재조회 검증이 성공한 뒤 Web과 worker에 `MRBEAST_SODA_STOCK_IMPACT_TICK_ENABLED=true`를 함께 적용한다.
7. 다음 자동 정기 시세에서 STM history 문구와 원장의 `appliedQuantity`, `lastAppliedOperationKey`를 재조회한다.

## Fail-closed 조건

다음 조건에서는 backfill을 진행하지 않고 원장을 수동 조사한다.

- 이벤트 시작·종료·집계 상한 시각을 걸친 일일 counter가 존재한다.
- 기간이 겹치는 다른 이벤트 또는 config version demand가 존재한다.
- 현재 demand에 이미 적용된 수량이 있다.
- demand 수량이 일일 counter 합계보다 크다.
- `DB_NAME`과 `MONGODB_DB_NAME`이 다르다.
- tick gate가 이미 활성화돼 있다.

이벤트 종료 뒤 자동 tick이 지연돼도 미적용 demand는 만료시키지 않는다. 다음 성공한 자동 tick이 원장과 STM 가격/history를 같은 transaction에서 반영한다. GM force tick은 demand를 소비하지 않는다.
