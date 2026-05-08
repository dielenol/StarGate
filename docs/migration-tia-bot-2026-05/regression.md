# tia_bot DB 통합 — 회귀 / 데이터 일관성 체크리스트

**Plan ID**: `tia-bot-mongo-integration-phase-1` (Phase 1E 산출물)
**작성일**: 2026-05-08
**대상 컷오버**: Phase 1F (일요일 오후, 다운타임 10–15분)

---

## 0. 개요

본 문서는 Phase 1F **컷오버 직전** (D-1 검증) 과 **컷오버 직후** (T+12 smoke test, T+5 일관성 검사) 에 사용하는 회귀 / 검증 체크리스트다.

| 카테고리 | 항목 수 | 시점 |
|---|---:|---|
| 사전 검증 (D-1) | 5 | 컷오버 전일 |
| 회귀 시나리오 (S1–S9) | 9 | T+12 (smoke test) |
| 데이터 일관성 (C1–C5) | 5 | T+5 (마이그 직후) |
| 정상 종료 기준 | 3 | 컷오버 + 24h |

실패 발견 시 [§5 롤백 트리거](#5-롤백-트리거) 로 이동. 컷오버 절차 자체는 `PLAN.md` §4 Phase 1F (cutover-runbook.md 작성 시 그쪽으로 일원화) 를 참조.

---

## 1. 컷오버 직전 사전 검증 (T-1일)

`pm2 stop` 전에 모두 PASS 이어야 한다.

| ID | 항목 | 검증 |
|---|---|---|
| P1 | `shop.db` 백업 확인 | `tia_bot/backup/shop.db.<timestamp>` 와 `pre-cutover.db` 2개 존재 + 크기 > 0 |
| P2 | mongo dry-run 결과 | `pnpm --filter @stargate/shared-db tsx scripts/migrate-tia-shop.ts --sqlite=<path> --dry-run` 종료 코드 0, SUM/count 보고 정상 |
| P3 | 신규 인덱스 생성 | `ensureAllIndexes()` 호출 또는 자동 생성 확인 — `credit_pools`, `shop_inventory`, `shop_daily_stock`, `stock_prices`, `stock_holdings` 5종 |
| P4 | 봇 호스트 의존성 | `pip install -r requirements.txt` 통과. `pymongo`, `dnspython`, `python-dotenv` 임포트 가능 |
| P5 | 환경변수 | 봇 호스트 `.env` 에 `MONGODB_URI`, `MONGODB_DB_NAME` 설정. mongo client ping OK |

**P2 dry-run 보고 항목** (참고):
- credits → credit_transactions 발급 건수 + 총잔액
- operation_pool → credit_pools 단일 문서 balance
- stock_holdings (shares > 0 only) 건수
- shop_inventory (quantity > 0 only) 건수
- 각 유저 (잔액 + Σ shares × price) 합계

---

## 2. 컷오버 직후 회귀 시나리오 (T+12, smoke test)

각 시나리오는 **목적 / 절차 / 기대 결과 / 실패 시 액션** 형식. 한 시나리오라도 실패 시 [§5](#5-롤백-트리거) 평가.

### S1. 봇 잔액 변경 → 웹앱 즉시 조회

- **목적**: discord ↔ users.discordId 매핑이 정상 작동하는지 확인 (마이그 핵심 가정).
- **절차**:
  1. 디스코드에서 GM 외 일반 유저로 `/잔고` 슬래시 명령 실행.
  2. 같은 사용자의 `/erp/credits` 페이지 접속, 본인 거래내역 페이지 조회.
- **기대 결과**: 두 화면의 **현재 잔액이 동일**. credit_transactions 의 latest balance == /잔고 표시값.
- **실패 시 액션**: `tia_bot/mongo/users.py` 의 `ensure_user(discord_id)` 가 올바른 ObjectId 매핑을 반환하는지 확인. mongo shell `db.users.findOne({discordId: "<snowflake>"})`. snowflake 가 string 으로 저장되어 있는지 (RSK-002).

### S2. 웹 → 봇 동기화

- **목적**: 웹에서 발급한 ledger event 를 봇이 즉시 인식하는지 (이벤트 소싱 정상성).
- **절차**:
  1. GM 계정으로 `/erp/credits` 페이지 진입 → 일반 유저에 ADMIN_GRANT 100 CR 발급.
  2. 5초 이내에 디스코드에서 해당 사용자의 `/잔고` 슬래시 명령 실행.
- **기대 결과**: 잔액이 정확히 +100 반영. ledger 의 마지막 event type=`ADMIN_GRANT`, balance 가 새 값.
- **실패 시 액션**: `mongo.credits.get_balance` 가 latest balance 를 가져오는 쿼리 확인 (sort: `createdAt: -1`, limit 1). 캐시/메모이제이션이 끼어 있는지 (어댑터 단에서 캐시 금지).

### S3. 편의점 구매 회귀 (PURCHASE)

- **목적**: shop_inventory atomic 갱신 + race-aware deleteOne 검증.
- **절차**:
  1. 일반 유저로 `/편의점` → 컵라면 1개 구매 (충분한 잔액 보유 상태).
  2. 디스코드 `/잔고` 와 mongo 인벤토리 동시 확인.
- **기대 결과**:
  - 잔액 -50 (또는 컵라면 정가)
  - `shop_inventory` 해당 user × 컵라면 quantity +1
  - `shop_daily_stock.컵라면.quantity` -1
  - `credit_transactions` 신규 1건 — `type: "PURCHASE"`, `metadata.itemId: "컵라면"`, `metadata.qty: 1`
- **실패 시 액션**: `tia_bot/mongo/shop.py` 의 `findOneAndUpdate({$inc: {-1}}, filter: {$gte: 1})` 쿼리 + race-aware deleteOne (quantity == 0 시 문서 삭제 vs 0 유지) 확인.

### S4. 주식 매수 회귀 (STOCK_BUY)

- **목적**: stock_holdings upsert + avgPrice 가중평균 계산 검증.
- **절차**:
  1. 일반 유저로 `/매수 BPE 5` (BPE 종목 5주 매수, 충분한 잔액).
  2. `/포트폴리오` 와 ledger 동시 확인.
- **기대 결과**:
  - 잔액 -(price × 5)
  - `stock_holdings` 해당 user × BPE: `shares` +5, `avgPrice` 가중평균 갱신
  - `credit_transactions` 신규 1건 — `type: "STOCK_BUY"`, `metadata.ticker: "BPE"`, `metadata.shares: 5`, `metadata.price: <당시 시세>`
- **실패 시 액션**: `tia_bot/mongo/stock.py` 의 `buy_holding` aggregation pipeline upsert (avgPrice = (oldShares × oldAvg + newShares × newPrice) / totalShares) 식 확인.

### S5. 주식 매도 + 손익 (STOCK_SELL)

- **목적**: shares atomic 차감 + 손익 metadata.profit 기록.
- **절차**:
  1. S4 직후 같은 유저로 `/매도 BPE 3` 실행.
- **기대 결과**:
  - 잔액 +(price × 3)
  - `stock_holdings` shares -3 (== 2주 잔존), avgPrice **변경 없음**
  - `credit_transactions` 신규 1건 — `type: "STOCK_SELL"`, `metadata.ticker: "BPE"`, `metadata.shares: 3`, `metadata.profit: <(현재가 - 평단) × 3>`
- **실패 시 액션**: `tia_bot/mongo/stock.py` 의 `sell_holding` atomic ($inc -shares + $gte filter) + race-aware deleteOne (shares == 0) 확인. avgPrice 가 매도 시 변경되지 않는지 확인.

### S6. 작전 풀 갱신 (OP_GRANT / OP_DEDUCT)

- **목적**: credit_pools 단일 문서 atomic 갱신 + 음수 가드 검증.
- **절차**:
  1. GM 으로 `!작전지급 100` 실행.
  2. `/작전크레딧` 으로 풀 잔액 확인.
  3. GM 으로 `!작전차감 50` (또는 `!작전지급 -50`) 실행.
- **기대 결과**: `credit_pools[poolId="OPERATION"].balance` 100 → 50 (단계별).
- **실패 시 액션**: `tia_bot/mongo/credits.py` 의 `addCreditPoolBalance($inc + $gte 0 가드)` 확인. 음수 잔액 가드가 동작해야 함 (총잔액 > 차감액 일 때만 성공).

### S7. `!전체지급` 회귀

- **목적**: list_balances_with_names + sequential ledger mutation 정합성.
- **절차**:
  1. GM 으로 `!전체지급 50` 실행 (운영 user 다수 대상).
- **기대 결과**:
  - 모든 활성 운영 user 잔액 +50
  - 각 user 의 `credit_transactions` 에 `ADMIN_GRANT` 1건씩 추가, balance 가 새 값
- **실패 시 액션**: `tia_bot/mongo/credits.py` 의 `list_balances_with_names()` 가 GM 제외 활성 유저만 반환하는지, sequential mutation 도중 한 건 실패해도 다른 건은 정상 반영되는지 확인 (transaction 미사용이라 부분 실패 가능 — 로그로 추적).

### S8. 재고 리셋 (월요일 06시 KST)

- **목적**: 일일 재고 자동 재시드 (`refresh_stock` daily job).
- **절차**:
  - **자연 검증**: 컷오버 후 첫 월요일 06:00 KST 의 daily_tasks 실행 대기.
  - **즉시 검증** (선택): GM 운영 채널에서 `/재고` 호출 직전에 시각을 06:00 으로 가정한 명령 또는 daily_tasks 함수를 직접 트리거.
- **기대 결과**: 모든 SHOP_ITEM 의 `shop_daily_stock.quantity` 가 정의된 일일 시드값으로 **재시드** (기존 quantity 무시). `lastRefresh` 가 KST 오늘 날짜로 갱신.
- **실패 시 액션**: `tia_bot/mongo/shop.py` 의 `needs_refresh(item_id, today_kst)` 와 `refresh_stock(item_id, stock, today_kst)` 호출 흐름 확인. KST tag 비교 (string equality) 가 정상인지.

### S9. 주식 시세 자동 갱신 (13/17/20시 KST)

- **목적**: STOCK_HOURS [13, 17, 20] 정시 갱신 + prevPrice 백업.
- **절차**: 컷오버 후 다음 STOCK_HOUR 도래 시 `update_stock_prices` 자동 실행을 대기.
- **기대 결과**:
  - 각 ticker 의 `stock_prices.price` 변경
  - `prevPrice` 가 직전 price 로 백업
  - `eventText` 갱신
  - `lastUpdate` 가 KST 오늘날짜+시각 tag 로 갱신
- **실패 시 액션**: `tia_bot/mongo/stock.py` 의 `update_stock_price` aggregation pipeline (`$set: { prevPrice: "$price", price: <new>, ... }`) 가 prevPrice 를 **이전 price 값으로** 백업하는지 확인 (prevPrice = $price 평가 순서).

---

## 3. 데이터 일관성 검사 (T+5, mongo shell / 검증 스크립트)

마이그 직후 `--verify-only` 또는 mongo shell 로 직접 비교. **모든 5개가 PASS** 이어야 컷오버 진행.

### C1. 잔액 합계 일치

```js
db.credit_transactions.aggregate([
  { $sort: { userId: 1, createdAt: -1 } },
  { $group: { _id: "$userId", balance: { $first: "$balance" } } },
  { $group: { _id: null, total: { $sum: "$balance" } } },
])
```

**기대**: `total` 값이 `SELECT SUM(balance) FROM credits` (SQLite) 와 일치.

### C2. 작전 풀 일치

```js
db.credit_pools.findOne({ poolId: "OPERATION" }).balance
```

**기대**: `SELECT balance FROM operation_pool` (SQLite) 와 일치.

### C3. 주식 보유 카운트

```js
db.stock_holdings.countDocuments({ shares: { $gt: 0 } })
```

**기대**: `SELECT COUNT(*) FROM stock_holdings WHERE shares > 0` (SQLite) 와 일치.

### C4. 인벤토리 카운트

```js
db.shop_inventory.countDocuments({ quantity: { $gt: 0 } })
```

**기대**: `SELECT COUNT(*) FROM inventory WHERE quantity > 0` (SQLite) 와 일치.

### C5. 총자산 보존 (per user)

각 유저의 (잔액 + Σ shares × stock_prices.price) 가 **마이그 전후 동일**.

```js
// 1) mongo: 각 유저의 latest balance + 보유주 평가액 합산
db.users.aggregate([
  {
    $lookup: {
      from: "credit_transactions",
      let: { uid: { $toString: "$_id" } },
      pipeline: [
        { $match: { $expr: { $eq: ["$userId", "$$uid"] } } },
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
        { $project: { balance: 1 } },
      ],
      as: "latest",
    },
  },
  {
    $lookup: {
      from: "stock_holdings",
      let: { uid: { $toString: "$_id" } },
      pipeline: [
        { $match: { $expr: { $and: [
          { $eq: ["$userId", "$$uid"] },
          { $gt: ["$shares", 0] },
        ] } } },
        { $lookup: {
            from: "stock_prices",
            localField: "ticker",
            foreignField: "ticker",
            as: "price",
          } },
        { $unwind: "$price" },
        { $project: { value: { $multiply: ["$shares", "$price.price"] } } },
      ],
      as: "holdings",
    },
  },
  {
    $project: {
      discordId: 1,
      total: {
        $add: [
          { $ifNull: [{ $arrayElemAt: ["$latest.balance", 0] }, 0] },
          { $sum: "$holdings.value" },
        ],
      },
    },
  },
])
```

**기대**: 각 user 의 `total` 값이 SQLite 측 (`credits.balance + Σ stock_holdings.shares × stock_prices.price`) 과 1 CR 단위로 일치.

> 마이그 스크립트 `--verify-only` 모드가 위 5종을 자동 실행하도록 권장.

---

## 4. 정상 종료 기준 (Success Criteria)

다음 3개 모두 충족하면 컷오버 종료:

1. **회귀 9 시나리오 모두 PASS** (T+12 smoke test 시점)
2. **일관성 5 검사 모두 일치** (T+5 시점, 또는 dry-run 단계에서 사전 확인)
3. **컷오버 후 24시간 내 추가 사용자 보고 데이터 손상 없음**

3 조건 충족 시 SQLite (`tia_bot/shop.db`) 는 read-only 처분, 12시간 후 mongo 가 single source of truth.

---

## 5. 롤백 트리거

다음 중 **하나라도** 발견되면 즉시 롤백 결정 회의 (12시간 윈도우 내):

- T+15 smoke test 에서 잔액 표시 오류 (S1/S2 실패)
- 데이터 일관성 검사 (C1–C5) 중 하나라도 불일치
- 컷오버 후 12시간 내 사용자 보고 데이터 손상 (잔액 음수, 보유주 사라짐 등)
- credit_transactions ledger 의 `balance` 가 음수로 기록되는 케이스 (이벤트 소싱 본질 침해)

### 롤백 절차 (요약)

> 상세 절차는 `cutover-runbook.md` (작성 예정) 참조. 본 문서는 트리거 + 핵심 step 만 명시.

1. `pm2 stop tia_bot`
2. `git revert <Phase 1C 커밋 hash>` (코드 원복) → `git push`
3. 봇 호스트에서 `tia_bot/backup/shop.db.<timestamp>` → `tia_bot/shop.db` 로 복원
4. mongo cleanup (선택): 마이그 잔재 제거
   ```js
   db.credit_transactions.deleteMany({ type: "MIGRATION" })
   db.credit_transactions.deleteMany({ description: { $regex: /^TIA_BOT_MIGRATION/ } })
   db.shop_inventory.deleteMany({})
   db.shop_daily_stock.deleteMany({})
   db.stock_prices.deleteMany({})
   db.stock_holdings.deleteMany({})
   db.credit_pools.deleteMany({ poolId: "OPERATION" })
   ```
5. 봇 호스트 `pip install -r requirements.txt` (이전 commit 기준) → 의존성 원복
6. `pm2 start tia_bot`
7. `/잔고` `/시세` 로 SQLite 모드 정상화 확인

**12시간 후**: mongo 가 source of truth 가 되었으므로 역마이그 비용이 너무 큼. SQLite 복원이 아닌 **mongo 측 hotfix 우선**.

---

## 6. 체크리스트 카드 (현장용)

> 컷오버 당일 단일 페이지로 출력해 GM/운영자가 시간순으로 체크.

```
[ ] P1 shop.db 백업 2종 존재
[ ] P2 dry-run 종료코드 0
[ ] P3 인덱스 5종 생성 확인
[ ] P4 pip install 통과
[ ] P5 mongo ping OK

--- T+0 다운타임 ---
[ ] pm2 stop
[ ] migrate-tia-shop --execute --yes
[ ] 일관성 C1 잔액 합계
[ ] 일관성 C2 작전 풀
[ ] 일관성 C3 보유주 카운트
[ ] 일관성 C4 인벤토리 카운트
[ ] 일관성 C5 총자산 per user
[ ] git pull / pip install / pm2 start

--- T+12 smoke ---
[ ] S1 봇→웹 잔액 일치
[ ] S2 웹→봇 동기화
[ ] S3 편의점 구매
[ ] S4 주식 매수
[ ] S5 주식 매도
[ ] S6 작전 풀 갱신
[ ] S7 !전체지급
[ ] S8 재고 리셋 (다음 월요일 06시 KST 자연 확인)
[ ] S9 시세 갱신 (다음 STOCK_HOUR 자연 확인)

--- T+15 다운타임 종료 ---
[ ] Discord 안내 메시지
[ ] shop.db read-only chmod

--- T+24h Success ---
[ ] 사용자 보고 0
[ ] 정상 종료 선언
```

---

## 7. 변경 이력

| 일자 | 변경 | 작성자 |
|---|---|---|
| 2026-05-08 | 초안 (Phase 1E) | implementer |
