# tia_bot DB 통합 — 컷오버 운영 runbook

**대상**: Phase 1F 실제 운영 적용
**소요**: ~15분 다운타임
**권장 시간**: 일요일 오후 (편의점/주식 시스템 마감일 — shop 영향 0)
**관련 문서**: [PLAN.md](PLAN.md) §4 Phase 1F / [regression.md](regression.md) §3-§5

---

## D-1 사전 준비 (전날까지 완료)

### 백업
- [ ] `tia_bot/shop.db` → `tia_bot/backup/shop.db.<YYYYMMDD-HHMM>` 복사
- [ ] mongo `mongodump --uri="$MONGODB_URI" --db=stargate --out=./backup-pre-tia-migration-<YYYYMMDD>` (선택, 안전 마진)

### dry-run 검증
- [ ] 마이그 스크립트 dry-run 실행:
  ```bash
  cd /Users/flitto/Code/StarGate
  pnpm --filter @stargate/shared-db exec tsx scripts/migrate-tia-shop.ts \
    --sqlite=tia_bot/shop.db \
    --dry-run \
    --migration-tag=tia-2026-05-08
  ```
- [ ] dry-run 결과 검토: user 매핑 / ledger 카운트 / 작전 풀 / 보유주 / 시세 / 인벤토리 / 재고 항목 모두 정상
- [ ] WARN 메시지 없음 (있으면 원인 분석)

### 환경 검증
- [ ] 봇 호스트에서 `pip install -r tia_bot/requirements.txt` 통과
- [ ] `tia_bot/.env` 에 `MONGODB_URI`, `MONGODB_DB_NAME=stargate` 설정
- [ ] `python3 -c "from pymongo import MongoClient; MongoClient('$MONGODB_URI').server_info()"` 연결 확인

### 코드 머지 확인
- [ ] develop 브랜치에 Phase 1A~1E 커밋 모두 적용됨 (f46bac5 / adf15c1 / 32006a5 / 6d9ea84 / 00b1d99 / 4bd3b37)

---

## T+0 — 다운타임 시작

### Step 1. Discord 안내
- [ ] SHOP_CHANNEL / STOCK_CHANNEL 양쪽에 안내:
  > 편의점/주식 시스템을 점검합니다. 약 15분간 사용 불가. (시작: HH:MM)

### Step 2. 봇 정지
```bash
pm2 stop tia_bot
pm2 logs tia_bot --lines 50  # 정지 확인
```
- [ ] `pm2 status` 에서 `stopped`

---

## T+2 — 마이그레이션 실행

### Step 3. 마이그 execute
```bash
pnpm --filter @stargate/shared-db exec tsx scripts/migrate-tia-shop.ts \
  --sqlite=tia_bot/shop.db \
  --execute --yes \
  --migration-tag=tia-2026-05-08
```
- [ ] 8단계 모두 ✓ 출력
- [ ] verify PASS (SUM 일치 / count 일치 / 총자산 일치)
- [ ] **실패 시**: catch 블록의 ROLLBACK GUIDE 따라 cleanup 후 재시도. 또는 백업 복원.

---

## T+8 — 코드 배포 + 봇 재시작

### Step 4. 코드 배포
```bash
# 봇 호스트에서
cd /Users/flitto/Code/StarGate
git pull origin main  # Phase 1A~1E 커밋 포함
cd tia_bot
pip install -r requirements.txt  # pymongo 등 신규 의존성
```
- [ ] `pip list | grep pymongo` 4.6+ 확인

### Step 5. 봇 시작
```bash
pm2 start tia_bot
pm2 logs tia_bot --lines 50
```
- [ ] `[on_ready] mongo 부트스트랩 OK` 로그 확인
- [ ] `_BOT_USER_ID_HEX` 주입 성공 로그 확인
- [ ] `ensure_op_pool` / `ensure_stock_prices` 부트스트랩 확인

---

## T+12 — Smoke test

[regression.md §3](regression.md) 의 9개 시나리오 중 핵심 4개 즉시 검증:

- [ ] **S1** — `/잔고` 호출 → 마이그된 잔액 표시. /erp/credits 페이지에서 동일 user 확인
- [ ] **S6** — GM `!작전지급 1` → `!작전차감 1` round-trip → 풀 잔액 변화 없음
- [ ] **S3** (가능하면) — `/편의점` → 가장 저렴한 아이템 1개 구매 → 잔액 -price, 인벤 +1, 재고 -1
- [ ] /erp/credits 페이지에서 마이그 ledger (`type=MIGRATION`) + smoke test 트랜잭션 확인

**실패 시**: T+15 진행 ❌, [§ 롤백](#롤백-12시간-윈도우) 즉시 트리거.

---

## T+15 — 다운타임 종료

### Step 6. 안내 + 정리
- [ ] Discord 양 채널 완료 안내:
  > 점검 완료. 편의점/주식 시스템 정상 동작합니다.
- [ ] `tia_bot/shop.db` 를 read-only 로 변경 (코드 미접근 확인용):
  ```bash
  chmod 444 tia_bot/shop.db
  # 또는 백업 폴더로 이동
  mv tia_bot/shop.db tia_bot/backup/shop.db.cutover-<YYYYMMDD>
  ```

---

## 12시간 모니터링

이후 12시간 동안 사용자 보고 + 운영 로그 모니터링.

### 데이터 일관성 재검사 (T+1h, T+6h, T+12h)
[regression.md §4](regression.md) 의 C1~C5 mongo aggregation 쿼리 실행. 모두 PASS 유지 확인.

### 12시간 후
- [ ] mongo가 source of truth 확정
- [ ] `tia_bot/backup/shop.db.<timestamp>` 보관 (선택, 영구 archive 또는 30일 후 삭제)

---

## 롤백 (12시간 윈도우)

다음 중 하나라도 발견 시 즉시 트리거:
- T+12 smoke test에서 잔액 표시 오류
- 데이터 일관성 검사 (C1~C5) 실패
- 12시간 내 사용자 보고 데이터 손상 (잔액/주식 누락)

### 롤백 절차

1. **봇 정지**: `pm2 stop tia_bot`
2. **코드 복귀**: `git revert 6d9ea84 4bd3b37 00b1d99 adf15c1 f46bac5` (또는 `git reset --hard <pre-cutover-commit>`)
3. **shop.db 복원**: `cp tia_bot/backup/shop.db.<timestamp> tia_bot/shop.db`
4. **mongo cleanup** (선택):
   ```js
   // mongo shell
   db.credit_transactions.deleteMany({"description": {$regex: "^TIA_BOT_MIGRATION_tia-2026-05-08"}})
   db.stock_holdings.drop()
   db.stock_prices.drop()
   db.shop_inventory.drop()
   db.shop_daily_stock.drop()
   db.credit_pools.deleteOne({poolId: "OPERATION"})
   ```
5. **봇 재시작**: `pm2 start tia_bot`
6. **smoke test (SQLite 모드)**: 기본 명령 정상 동작 확인
7. **사용자 안내**: 시스템 복귀 + 마이그 재시도 일정 안내

**12시간 후**: mongo 가 source of truth → 역마이그 비용 큼 (mongo→SQLite export 필요). 가능한 12시간 윈도우 내 결정.

---

## 정상 종료 기준

- [ ] 9개 회귀 시나리오 (regression.md §3) 모두 PASS
- [ ] 5개 데이터 일관성 (regression.md §4) 모두 일치
- [ ] 컷오버 후 24시간 내 추가 사용자 보고 없음
- [ ] mongo backup + shop.db backup 보관 확인

위 모두 충족 → **마이그 성공 종료**.
