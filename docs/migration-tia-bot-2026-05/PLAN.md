# tia_bot DB 통합 Phase 1 — 검토용 플랜

**Plan ID**: `tia-bot-mongo-integration-phase-1`
**작성일**: 2026-05-08
**목적**: tia_bot의 shop/stock SQLite를 stargate MongoDB로 통합. 봇 코드는 Python 유지.

---

## 1. 범위 (In/Out)

### Scope IN (이번 Phase에서 처리)

- `packages/shared-db` 신규 컬렉션 5종: `credit_pools`, `shop_inventory`, `shop_daily_stock`, `stock_prices`, `stock_holdings`
- `credit_transactions.type` enum 확장 (`STOCK_BUY`, `STOCK_SELL`, `OP_GRANT`, `OP_DEDUCT`, `MIGRATION`)
- tia_bot Python pymongo 어댑터 모듈 4종 (`tia_bot/mongo/{credits,shop,stock,users}.py`)
- `shop.py` / `stock_system.py` 의 SQLite 호출 전면 치환
- 1회성 마이그레이션 스크립트 (`packages/shared-db/scripts/migrate-tia-shop.ts`, dry-run 지원)
- 검증 / 회귀 시나리오 + 컷오버/롤백 절차 (runbook)

### Scope OUT (이번 Phase 제외)

- StarGateV2 웹앱 신규 UI (편의점/주식/포트폴리오) → **Phase 2 후보**
- tia_bot 명령어 추가/UX 개선
- PIL 이미지 렌더 변경 (DB 변경과 무관, 그대로 유지)
- `chat.db` / `sessions.db` 마이그레이션 (별도 Phase)
- AI 이벤트 prompt / Copilot API 통신 변경
- registra-bot / trpg-bot 변경
- bianca_bot.py (현재 미완성, 별도 작업)

---

## 2. 영역 (변경 대상 파일)

### `packages/shared-db/` (TypeScript)

**신규 (6 파일, ~470 LOC)**

| 파일 | LOC | 역할 |
|---|---:|---|
| `src/types/credit-pool.ts` | 25 | credit_pools 타입 |
| `src/types/shop.ts` | 35 | shop_inventory + shop_daily_stock 타입 |
| `src/types/stock.ts` | 35 | stock_prices + stock_holdings 타입 |
| `src/crud/credit-pools.ts` | 80 | credit_pools CRUD |
| `src/crud/shop.ts` | 130 | shop_inventory + shop_daily_stock CRUD |
| `src/crud/stocks.ts` | 180 | stock_prices + stock_holdings CRUD |

**수정 (5 파일, ~132 LOC)**

| 파일 | LOC delta | 변경 |
|---|---:|---|
| `src/types/credit.ts` | +4 | type enum 5개 추가 (`STOCK_BUY` 등), 선택 `metadata` 필드 |
| `src/types/index.ts` | +15 | 신규 타입 re-export |
| `src/collections.ts` | +50 | COL 상수 5개 + accessor 함수 쌍 |
| `src/indexes.ts` | +60 | ensureAllIndexes에 인덱스 5종 추가 |
| `src/crud/index.ts` | +3 | 신규 crud 모듈 re-export |

**스크립트**

| 파일 | LOC | 역할 |
|---|---:|---|
| `scripts/migrate-tia-shop.ts` | 350 | shop.db → MongoDB 1회성 (dry-run/execute/verify-only) |

### `tia_bot/` (Python)

**신규 (6 파일, ~555 LOC)**

| 파일 | LOC | 역할 |
|---|---:|---|
| `mongo/__init__.py` | 5 | submodule export |
| `mongo/client.py` | 50 | MongoClient 싱글톤 (maxPoolSize=10) |
| `mongo/users.py` | 70 | Discord ↔ MongoDB user 매핑 (ensure_user) |
| `mongo/credits.py` | 130 | credit_transactions / credit_pools 어댑터 |
| `mongo/shop.py` | 100 | shop_inventory / shop_daily_stock 어댑터 |
| `mongo/stock.py` | 200 | stock_prices / stock_holdings 어댑터 |

**수정**

| 파일 | LOC delta | 변경 |
|---|---:|---|
| `shop.py` | -127 net (-180 sqlite, +60 mongo, +30 wrapper, -7 정리) | SQLite 호출 전면 제거 |
| `stock_system.py` | -99 net (-120 sqlite, +21 mongo) | SQLite 호출 전면 제거 |
| `requirements.txt` | +3 | pymongo, dnspython, python-dotenv |
| `.env.example` | +2 | MONGODB_URI, MONGODB_DB_NAME |

### Docs (Phase 1E/1F runbook)

| 파일 | LOC | 역할 |
|---|---:|---|
| `docs/migration-tia-bot-2026-05/PLAN.md` | (this file) | 본 문서 |
| `docs/migration-tia-bot-2026-05/regression.md` | 80 | 회귀 체크리스트 |
| `docs/migration-tia-bot-2026-05/cutover-runbook.md` | 100 | 컷오버 절차 |

### 총계

- 신규 코드: **1,745 LOC**
- 수정 코드: **+132 LOC**
- 삭제 코드: **-226 LOC** (SQLite 호출 제거분)
- 문서: 330 LOC
- **순 코드 증가: +1,651 LOC**

---

## 3. 스키마 매핑 (확정)

| tia_bot SQLite | MongoDB | 비고 |
|---|---|---|
| `credits.balance` | `credit_transactions` | 이벤트 소싱 (latest balance 스냅샷) |
| `operation_pool` | `credit_pools` (poolId='OPERATION') | 다중 문서 구조 (확장성) |
| `trade_log` | `credit_transactions.description` + `metadata` | 별도 로그 폐기, ledger가 감사 역할 |
| `inventory` | `shop_inventory` (user 단위) | character_inventory와 도메인 분리 |
| `daily_stock` | `shop_daily_stock` | 1:1 |
| `stock_prices` | `stock_prices` | 1:1 |
| `stock_holdings` | `stock_holdings` | 1:1 |
| `SHOP_ITEMS` 코드 상수 | (변경 없음) | 코드 상수 유지 |
| `STOCKS` 코드 상수 | (변경 없음) | 코드 상수 유지 |

### `credit_transactions.type` enum 확장

기존: `SESSION_REWARD | PURCHASE | ADMIN_GRANT | ADMIN_DEDUCT | TRANSFER`
신규: + `STOCK_BUY | STOCK_SELL | OP_GRANT | OP_DEDUCT | MIGRATION`

**API 검증 분리**: `POST /api/erp/credits` 의 `validTypes` 화이트리스트는 기존 3종(`ADMIN_GRANT/ADMIN_DEDUCT/SESSION_REWARD`)만 유지. 봇 전용 타입(STOCK_*, OP_*, MIGRATION, PURCHASE, TRANSFER)은 웹 API에서 거부 → 웹에서 임의 STOCK_BUY 발급 차단.

---

## 4. Phase 분해 (독립 머지 가능 단위)

### Phase 1A — shared-db 컬렉션/CRUD 추가

- **롤백**: 신규 컬렉션 추가만이라 기존 동작 영향 0. 단독 머지 가능.
- **검증**: `ensureAllIndexes()` 호출 시 신규 5개 인덱스 생성. import 타입 에러 없음.
- **LOC**: 617

### Phase 1B — Python 어댑터 모듈

- **롤백**: 1A 완료 후 작성. 기존 shop.py/stock_system.py 변경 없으면 봇 동작 무영향.
- **의존성 추가**: pymongo>=4.6, dnspython>=2.6, python-dotenv>=1.0
- **동시성**: 봇 단일 프로세스라 낙관적 락만 — `shop_daily_stock` / `stock_holdings` 는 `findOneAndUpdate` atomic ($inc + $gte filter)
- **LOC**: 555

### Phase 1C — shop.py / stock_system.py 치환

- **롤백**: 단일 PR로 한 번에. git revert로 복귀 가능 (단, 마이그된 데이터는 SQLite로 복귀 필요 → 1F)
- **함수 치환 핵심**:
  - `init_shop_db()` / `init_stock_db()` → 삭제 (mongo client가 connection 관리)
  - `get_balance` / `add_credits` → `mongo.credits.*` 위임
  - `log_trade` → 삭제 (description + metadata로 흡수)
  - `cleanup_old_trades` → 삭제 (credit_transactions는 영구 보관)
  - PIL 렌더 함수는 그대로 (`draw_summary_image` 등은 mongo 쿼리로 데이터만 변경)
- **LOC delta**: -226

### Phase 1D — 마이그레이션 스크립트

- **위치**: `packages/shared-db/scripts/migrate-tia-shop.ts`
- **CLI**: `pnpm --filter @stargate/shared-db tsx scripts/migrate-tia-shop.ts --sqlite=<path> [--dry-run|--execute --yes] [--verify-only]`
- **실행 순서**:
  1. Discord ID 매핑 수집 (`upsertDiscordUser` 호출 → `Map<discordId, ObjectId>`)
  2. `credits` → `credit_transactions` 초기 ledger (type=`MIGRATION`, balance 스냅샷)
  3. `operation_pool` → `credit_pools` (poolId='OPERATION')
  4. `stock_holdings` → `stock_holdings` (shares=0 skip)
  5. `stock_prices` → `stock_prices` (덮어쓰기)
  6. `inventory` → `shop_inventory` (quantity=0 skip)
  7. `daily_stock` → `shop_daily_stock`
  8. `trade_log` 폐기
  9. 검증: SUM 비교, count 비교, 총자산 일치
- **멱등성**: 재실행 시 `MIGRATION` type description tag 검사로 중복 방지
- **LOC**: 350

### Phase 1E — 검증 / 회귀 테스트 (9 시나리오)

1. 봇 잔액 변경 → 웹앱 즉시 조회 일치
2. 웹 → 봇 동기화
3. 편의점 구매 회귀
4. 주식 매수 회귀
5. 주식 매도 + 손익
6. 작전 풀 갱신
7. `!전체지급` 회귀
8. 재고 리셋 (월요일 06시)
9. 주식 시세 자동 갱신 (13/17/20시)

**데이터 일관성 체크**:
- `SUM(latest credit_transactions.balance per userId) == SUM(SQLite credits.balance)`
- `credit_pools[OPERATION].balance == SQLite operation_pool.balance`
- `COUNT(stock_holdings.shares > 0)` 일치
- 각 유저 (잔액 + 보유주 평가액) 마이그 전후 동일

### Phase 1F — 컷오버 / 롤백

- **다운타임**: 10–15분 권장 (일요일 오후, shop 마감일이라 영향 0)
- **dual-write 미적용** (단순 컷오버) — race condition 복잡도 대비 이점 적음
- **컷오버 6단계**:
  1. **D-1 사전 준비**: shop.db 백업, ensureAllIndexes, dry-run 실행, 코드 머지
  2. **T+0 다운타임 시작**: Discord 안내, `pm2 stop tia_bot`
  3. **T+2 마이그 실행**: `--execute --yes`, 검증 PASS 확인
  4. **T+8 코드 배포**: git pull, pip install, .env 추가, `pm2 start tia_bot`
  5. **T+12 smoke test**: `/잔고 /작전크레딧 /시세`, GM round-trip, /erp/credits 확인
  6. **T+15 다운타임 종료**: 안내, shop.db read-only 처리

- **롤백 (12시간 윈도우)**:
  - pm2 stop → git revert 1C → shop.db 복원 → mongo cleanup → pm2 start
  - 12시간 후에는 mongo가 source of truth (역마이그 비용 큼)

---

## 5. 결정 필요 항목 (사용자 확인)

| ID | 질문 | 권장안 | 영향 |
|---|---|---|---|
| **DEC-001** | itemId/ticker 집계: description 파싱 vs metadata 필드? | **A. metadata 필드 추가** (`{ itemId?, ticker?, shares?, qty? }`) | 성능, 정확성, 미래 확장성 |
| **DEC-002** | type enum 확장 vs PURCHASE/ADMIN_*에 흡수? | **A. 5개 추가** (STOCK_BUY/SELL/OP_GRANT/OP_DEDUCT/MIGRATION) | audit, 통계 단순화 |
| **DEC-003** | credit_pools 단일 문서 vs 다중 문서? | **A. 다중 문서 + poolId 인덱스** | 확장성 (EVENT_POOL 등 추가 가능) |
| **DEC-004** | GM 권한: display_name 하드코딩 → user.role=='GM' 강화 본 Phase 포함? | **B. Phase 2로 미룸** | 데이터 통합에 집중, 회귀 테스트 단순화 |
| **DEC-005** | INITIAL_CREDITS 자동 시드 로직 유지? | **A. 1회 시드 + 신규 사용자 자동 시드 유지** | 기존 UX 보존 |
| **DEC-006** | 10–15분 다운타임 OK? 일요일 오후 컷오버? | **A. 다운타임 OK + 일요일** | 단순한 컷오버 |

---

## 6. Ongoing Risk (마이그 후 모니터링)

| ID | 리스크 | 완화 |
|---|---|---|
| RSK-001 | 이벤트 소싱 latest balance race window (웹+봇 동시 mutation) | Phase 1은 무시 (봇 단일 프로세스). Phase 2에서 표면화 시 mongo transaction 도입 |
| RSK-002 | Discord snowflake INTEGER → string 변환 누락 | 마이그 검증 단계에서 string 변환 확인. 어댑터에서 항상 `str(discord_id)` 강제 |
| RSK-003 | 마이그 도중 명령 실행 시 데이터 손실 | 다중 백업 (timestamp + pre-cutover.db 2개) |
| RSK-004 | pymongo sync 호출 → discord.py 이벤트 루프 블로킹 | 각 쿼리 < 100ms 가정. Phase 2에서 motor (async) 검토 |
| RSK-005 | MongoDB 연결 끊김 | pymongo 자동 재연결 + 봇 시작 시 ping 검증 |
| RSK-006 | 시간대 (KST 문자열 vs UTC Date) 혼재 | `lastRefresh`/`lastUpdate`는 KST string 유지, `createdAt`은 UTC Date. 코드 주석 명시 |

---

## 7. 권장 진행 순서

1. **Phase 1A 머지** (shared-db만, 단독 안전)
2. **Phase 1B 머지** (Python 어댑터, 호출처 없음)
3. **Phase 1D dry-run** (코드는 머지하지 않고 마이그 결과만 확인)
4. **Phase 1C 머지** (치환 — 이 시점에는 코드만 변경, 실DB 데이터 마이그는 컷오버 시점)
5. **Phase 1E 검증 시나리오 작성**
6. **Phase 1F 컷오버 실행** (사전 협의된 일요일 오후)

---

## 8. 다음 Phase (참고)

- StarGateV2 웹앱에 편의점/주식/포트폴리오 페이지 추가 (`/erp/credits` 확장)
- tia_bot GM 권한 체크 강화
- credit_transactions archive 정책
- pymongo → motor (async) 전환
- stock_events history 컬렉션 분리
