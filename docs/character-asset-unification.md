# 자산 단위 통일 정책

플레이어 소유 자산은 **character 단위로 통일**한다 (한 user 가 여러 캐릭터를 운용할 때, 자산이 user 가 아닌 어떤 캐릭터에 귀속되는지 명확하게 하기 위함).

## 정책 요약

- 1인 1 MAIN AGENT 캐릭터를 강제 (운영자 발급/봇 명령은 메인 캐릭으로 자동 라우팅)
- MAIN 캐릭터 미등록 user 는 발급 거절 (운영자가 사전 등록)
- NPC / MINI 캐릭은 자산 ledger 대상 ❌

## 진행 현황

- credit_transactions: character 단위 (Phase 2 완료)
- shop_inventory: 향후 character 단위 전환 예정
- stock_holdings: 향후 character 단위 전환 예정
- character_inventory: character 단위 (기존)

## 향후 작업 (Out of scope, 본 phase 외)

- registra-bot 신규 명령 (Phase C) — `/credit grant` 등의 봇 측 owner→character 라우팅
- shared-db scripts/migrate-tia-shop 재작성 (Phase D) — character 기준 시드
- 띠아봇 (tia_bot) 코드 정리/폐기

## 관련 진입점

- shared-db `findMainCharacterByOwner(ownerId)` — owner → 메인 AGENT 캐릭터 단일 진입점.
  여러 개 발견 시 throw (1인 1 MAIN 정책 위반).
- shared-db `getCharacterBalance(characterId)` — character 단위 latest balance.
- shared-db `addCredit(characterId, characterCodename, ownerId, ownerName, amount, type, description, createdById, createdByName, metadata?)` — character 단위 트랜잭션 생성 (race-aware best-effort).
- StarGateV2 API `POST /api/erp/credits` — body 의 `characterId` 우선, 없으면 `ownerId` 의 메인 캐릭으로 라우팅.
- StarGateV2 API `GET /api/erp/credits` — 본인의 메인 캐릭 ledger. V+ 권한이면 query `?characterId` 또는 `?ownerId` 로 다른 대상 조회.

## 인덱스

`credit_transactions`:
- `{ characterId: 1, createdAt: -1 }` — characterId 단위 ledger 조회 + balance 조회
- `{ ownerId: 1, createdAt: -1 }` — owner 역참조 (GM audit / owner 단위 검색)
- 기존 `{ "metadata.ticker": ... }`, `{ "metadata.poolId": ... }`, `{ type: 1, createdAt: -1 }` 유지

## 인덱스 마이그레이션 (수동 1회 — leftover 정리)

Phase 2 전환으로 user 단위 인덱스가 character 단위로 교체되었다. 운영 mongo 에 leftover ghost
인덱스가 남아 있을 수 있어 다음 명령을 1회 실행한다.

```js
// mongo shell — 운영 인스턴스에서 실행
use stargate

// 구 인덱스 drop (없으면 무시 — try/catch 권장)
try { db.credit_transactions.dropIndex("credit_transactions_userId"); }
catch (e) { print("[skip] credit_transactions_userId not found"); }

try { db.credit_transactions.dropIndex("credit_transactions_createdAt"); }
catch (e) { print("[skip] credit_transactions_createdAt not found"); }

// 신규 인덱스는 ensureAllIndexes() 가 다음 호출 시 자동 생성 — 별도 createIndex 불필요.
```

`credit_transactions` 데이터 0건 환경에서는 leftover 가 비어있어 즉시 영향이 없으나, ghost
인덱스 정리 차원에서 권장. 마이그레이션 시점:

- shared-db deploy 직후 1회 (운영 인스턴스).
- 본 작업 후 다음 ERP 요청에서 `ensureAllIndexes()` 가 신규 인덱스를 생성하는지 로그로 확인.
