/**
 * credit_transactions CRUD — character 단위 ledger.
 *
 * Phase 2 에서 user 단위 → character 단위로 전환됨. NPC/MINI 는 ledger 대상 ❌
 * (AGENT + MAIN tier 만). owner 단위 조회는 `findMainCharacterByOwner` 로 메인
 * 캐릭터를 먼저 해석한 뒤 character 단위 함수를 호출한다.
 *
 * GM 운영 대시보드용 집계/필터 함수도 본 모듈에 포함:
 * - `sumLatestBalancesByCharacterIds` — 다중 캐릭 latest balance 합산 (KPI)
 * - `getCreditsActivity24h` — 24h 발급/차감 활동 (KPI)
 * - `listCreditTransactionsFiltered` / `countCreditTransactionsFiltered` — 다중 조건 검색
 * - `findTransactionsBySessionMetadata` — 세션 자동 보상 멱등 검출
 */

import type { Filter } from "mongodb";
import { ObjectId } from "mongodb";

import type {
  CreateCreditTransactionInput,
  CreditTransaction,
  CreditTransactionType,
} from "../types/index.js";

import { creditTransactionsCol } from "../collections.js";

const CREDIT_SCALE = 100;

function roundCreditValue(value: number): number {
  return Math.round((value + Number.EPSILON) * CREDIT_SCALE) / CREDIT_SCALE;
}

/** characterId 단위 ledger 조회 (createdAt 내림차순). */
export async function listCreditTransactions(
  characterId?: string,
  limit = 100
): Promise<CreditTransaction[]> {
  const col = await creditTransactionsCol();
  const filter = characterId ? { characterId } : {};
  return col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
}

/** characterId 단위 latest balance. */
export async function getCharacterBalance(
  characterId: string
): Promise<number> {
  const col = await creditTransactionsCol();
  const doc = await col.findOne(
    { characterId },
    { sort: { createdAt: -1 } }
  );
  return doc ? doc.balance : 0;
}

export async function createCreditTransaction(
  input: CreateCreditTransactionInput
): Promise<CreditTransaction> {
  const col = await creditTransactionsCol();
  const doc: CreditTransaction = { ...input, createdAt: new Date() };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findTransactionById(
  id: string
): Promise<CreditTransaction | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await creditTransactionsCol();
  return col.findOne({ _id: new ObjectId(id) });
}

/**
 * 캐릭터 잔액 변경 — latest balance read + 새 잔액 계산 + insertOne.
 *
 * race window: 봇+웹 동시 mutation 시 잔액 stale 가능 (Phase 2 mongo transaction 검토).
 * 단일 봇 프로세스 + 일반적 웹 mutation 빈도 낮은 환경에서는 현실 영향 적음.
 *
 * 음수 잔액 정책:
 * - 기본 거부 (잔액 부족 시 throw). 호출처에서 try/catch 로 400 등으로 변환.
 * - `allowNegative: true` 인 호출만 음수 진입 허용 (ADMIN_DEDUCT 등 GM 의도 차감).
 *
 * named-object 시그니처 — 다인수 positional 호출의 인자 swap 사고를 차단하고
 * 옵션 추가 시 호출처 영향 최소화.
 */
export async function addCredit(input: {
  characterId: string;
  characterCodename: string;
  ownerId: string;
  ownerName: string;
  amount: number;
  type: CreditTransaction["type"];
  description: string;
  createdById: string;
  createdByName: string;
  metadata?: CreditTransaction["metadata"];
  /**
   * 음수 잔액 허용. 기본 false.
   * - ADMIN_DEDUCT (GM 의도 차감) 등에서 true 권장.
   * - 사용자 발급 (구매/매수 등) 은 false 유지 — 잔액 부족 거절.
   */
  allowNegative?: boolean;
}): Promise<CreditTransaction> {
  const col = await creditTransactionsCol();
  const latest = await col.findOne(
    { characterId: input.characterId },
    { sort: { createdAt: -1 } }
  );
  const currentBalance = latest?.balance ?? 0;
  const amount = roundCreditValue(input.amount);
  const newBalance = roundCreditValue(currentBalance + amount);

  if (newBalance < 0 && !input.allowNegative) {
    throw new Error(
      `addCredit: 음수 잔액 거부 — characterId=${input.characterId}, ` +
        `current=${currentBalance}, delta=${amount}. ` +
        `allowNegative 옵션이 필요한 호출이면 명시적으로 전달할 것.`
    );
  }

  const doc: CreditTransaction = {
    characterId: input.characterId,
    characterCodename: input.characterCodename,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    type: input.type,
    amount,
    balance: newBalance,
    description: input.description,
    createdById: input.createdById,
    createdByName: input.createdByName,
    createdAt: new Date(),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/**
 * @deprecated character 단위 전환됨. owner의 메인 캐릭 잔액을 합산하려면
 * `findMainCharacterByOwner(ownerId)` 로 메인 캐릭을 찾은 뒤
 * `getCharacterBalance(character._id)` 를 호출하라.
 *
 * 호출 시 throw — 실수 호출을 silent fallback 으로 숨기지 않기 위함.
 */
export async function getUserBalance(_ownerId: string): Promise<number> {
  throw new Error(
    "getUserBalance() is deprecated. Use getCharacterBalance(characterId) instead. " +
      "Owner의 메인 캐릭터를 찾으려면 findMainCharacterByOwner 사용."
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * GM 운영 대시보드용 집계/필터 함수 (Phase 3)
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 다중 캐릭터의 latest balance 합산.
 *
 * Aggregation pipeline:
 * 1. $match { characterId: { $in: ids } }
 * 2. $sort { createdAt: -1 }
 * 3. $group _id: characterId, latestBalance: { $first: "$balance" }
 * 4. $group _id: null, totalBalance: { $sum: "$latestBalance" },
 *           items: { $push: { id, balance } }
 *
 * 빈 배열 입력 시 mongo 호출 없이 `{ totalBalance: 0, perCharacter: {} }` 반환.
 * 인덱스: `credit_transactions_characterId_createdAt` 활용 ($match + $sort).
 *
 * 사용처: /api/erp/admin/credits/kpi (전체 발행 잔액 합계 + 캐릭 단위 분포).
 */
export async function sumLatestBalancesByCharacterIds(
  characterIds: string[]
): Promise<{ totalBalance: number; perCharacter: Record<string, number> }> {
  if (characterIds.length === 0) {
    return { totalBalance: 0, perCharacter: {} };
  }

  const col = await creditTransactionsCol();
  const result = await col
    .aggregate<{
      totalBalance: number;
      items: { id: string; balance: number }[];
    }>([
      { $match: { characterId: { $in: characterIds } } },
      // createdAt 동률(동일 ms 배치 적재) 시 _id 로 tie-break — $first 결정론 보장.
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: "$characterId",
          latestBalance: { $first: "$balance" },
        },
      },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: "$latestBalance" },
          items: { $push: { id: "$_id", balance: "$latestBalance" } },
        },
      },
    ])
    .toArray();

  if (result.length === 0) {
    return { totalBalance: 0, perCharacter: {} };
  }

  const { totalBalance, items } = result[0];
  const perCharacter: Record<string, number> = {};
  for (const { id, balance } of items) {
    perCharacter[id] = balance;
  }
  return { totalBalance, perCharacter };
}

/**
 * 다중 캐릭터의 latest 트랜잭션 스냅샷 (balance + createdAt) 일괄 조회.
 *
 * 잔액 보드의 캐릭터별 `getCharacterBalance` + `listCreditTransactions(id, 1)`
 * N+1 호출(캐릭 수 × 2 왕복)을 단일 aggregation 으로 대체한다.
 *
 * - 트랜잭션이 없는 캐릭터는 결과 Record 에서 누락 — 호출자가
 *   `?? { balance: 0, lastTxAt: null }` 폴백 (getCharacterBalance 의 0 폴백과 동일).
 * - 빈 배열 입력 시 mongo 호출 없이 `{}` 반환.
 * - 인덱스: `credit_transactions_characterId_createdAt` 활용 ($match + $sort).
 *
 * 사용처: /api/erp/admin/credits/balances + admin/credits/_data (잔액 보드).
 */
export async function getLatestCreditSnapshotsByCharacterIds(
  characterIds: string[]
): Promise<Record<string, { balance: number; lastTxAt: Date }>> {
  if (characterIds.length === 0) {
    return {};
  }

  const col = await creditTransactionsCol();
  const rows = await col
    .aggregate<{ _id: string; balance: number; lastTxAt: Date }>([
      { $match: { characterId: { $in: characterIds } } },
      // createdAt 동률 시 _id tie-break — sumLatestBalancesByCharacterIds 와 동일 규칙.
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: "$characterId",
          balance: { $first: "$balance" },
          lastTxAt: { $first: "$createdAt" },
        },
      },
    ])
    .toArray();

  const snapshots: Record<string, { balance: number; lastTxAt: Date }> = {};
  for (const row of rows) {
    snapshots[row._id] = { balance: row.balance, lastTxAt: row.lastTxAt };
  }
  return snapshots;
}

/**
 * 최근 24시간 발급/차감 활동 합계.
 *
 * - granted: amount > 0 의 합 (양수)
 * - deducted: amount < 0 의 절댓값 합 (양수)
 * - txCount: 트랜잭션 건수
 *
 * 인덱스: `credit_transactions_type_createdAt` 의 createdAt 부분 활용
 * (전체 type 스캔이지만 createdAt 범위 필터로 24h 만 읽음).
 *
 * 사용처: /api/erp/admin/credits/kpi.
 */
export async function getCreditsActivity24h(
  now: Date = new Date()
): Promise<{ granted: number; deducted: number; txCount: number }> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const col = await creditTransactionsCol();
  const result = await col
    .aggregate<{ granted: number; deducted: number; txCount: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          granted: {
            $sum: {
              $cond: [{ $gt: ["$amount", 0] }, "$amount", 0],
            },
          },
          deducted: {
            $sum: {
              $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0],
            },
          },
          txCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  if (result.length === 0) {
    return { granted: 0, deducted: 0, txCount: 0 };
  }
  const { granted, deducted, txCount } = result[0];
  return { granted, deducted, txCount };
}

/**
 * 다중 조건 필터로 트랜잭션 검색하기 위한 query 빌더 (내부 헬퍼).
 *
 * undefined / 빈 배열 필드는 query 에 추가하지 않는다 — 인덱스 손상 방지.
 * `listCreditTransactionsFiltered` 와 `countCreditTransactionsFiltered` 가 공유.
 *
 * characterId(단건) vs characterIds(다중) 우선순위:
 * - 둘 다 주어지면 단건이 우선 (호출처 모호 방지). GM 이 명시적으로 단건을 지정한
 *   경우는 그 의도를 존중하고 다중 화이트리스트는 무시.
 * - 단건이 없고 다중이 빈 배열이 아니면 `{ $in: characterIds }` 적용.
 * - 둘 다 비어 있으면 characterId 조건 자체를 추가하지 않는다.
 */
function buildCreditFilterQuery(filter: {
  types?: CreditTransactionType[];
  ownerId?: string;
  characterId?: string;
  characterIds?: string[];
  from?: Date;
  to?: Date;
  amountMin?: number;
  amountMax?: number;
}): Filter<CreditTransaction> {
  const query: Filter<CreditTransaction> = {};

  if (filter.types && filter.types.length > 0) {
    query.type = { $in: filter.types };
  }
  if (filter.ownerId) {
    query.ownerId = filter.ownerId;
  }
  if (filter.characterId) {
    query.characterId = filter.characterId;
  } else if (filter.characterIds && filter.characterIds.length > 0) {
    query.characterId = { $in: filter.characterIds };
  }
  if (filter.from || filter.to) {
    const range: { $gte?: Date; $lt?: Date } = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lt = filter.to;
    query.createdAt = range;
  }
  if (filter.amountMin !== undefined || filter.amountMax !== undefined) {
    const range: { $gte?: number; $lte?: number } = {};
    if (filter.amountMin !== undefined) range.$gte = filter.amountMin;
    if (filter.amountMax !== undefined) range.$lte = filter.amountMax;
    query.amount = range;
  }

  return query;
}

/**
 * 다중 조건 필터로 트랜잭션 검색 (페이지네이션 지원).
 *
 * 모든 필터 필드는 optional. undefined/빈 값은 mongo 쿼리에서 제외하여
 * 인덱스를 손상시키지 않는다.
 *
 * - types: { $in: types } (1개 이상이면)
 * - ownerId / characterId: 정확 매칭
 * - characterIds: { $in: characterIds } — characterId(단건) 가 비어 있을 때만 적용.
 *   admin 라우트에서 운영(isPublic !== false) 캐릭터 IDs 화이트리스트로 사용.
 * - from / to: createdAt: { $gte: from, $lt: to } (한쪽만 있어도 처리)
 * - amountMin / amountMax: amount: { $gte: min, $lte: max }
 * - limit (default 50, max 200), skip (default 0)
 *
 * 정렬: createdAt 내림차순.
 * 인덱스: characterId/ownerId/type 복합 인덱스 중 가장 좁은 것이 자동 선택.
 *
 * 사용처: /api/erp/admin/credits/log.
 */
export async function listCreditTransactionsFiltered(filter: {
  types?: CreditTransactionType[];
  ownerId?: string;
  characterId?: string;
  characterIds?: string[];
  from?: Date;
  to?: Date;
  amountMin?: number;
  amountMax?: number;
  limit?: number;
  skip?: number;
}): Promise<CreditTransaction[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const skip = Math.max(filter.skip ?? 0, 0);
  const query = buildCreditFilterQuery(filter);

  const col = await creditTransactionsCol();
  return col
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

/**
 * `listCreditTransactionsFiltered` 와 동일 필터 객체를 받아 매칭 카운트만 반환.
 *
 * limit/skip 무시 — 페이지네이션 total 산출용.
 * `characterIds` 동작은 `listCreditTransactionsFiltered` 와 동일 (단건 우선, 둘 다
 * 비면 무시). 사용처: /api/erp/admin/credits/log (count 응답 필드).
 */
export async function countCreditTransactionsFiltered(filter: {
  types?: CreditTransactionType[];
  ownerId?: string;
  characterId?: string;
  characterIds?: string[];
  from?: Date;
  to?: Date;
  amountMin?: number;
  amountMax?: number;
}): Promise<number> {
  const query = buildCreditFilterQuery(filter);
  const col = await creditTransactionsCol();
  return col.countDocuments(query);
}

/**
 * 특정 세션의 자동 보상 이력 조회 (멱등 검출).
 *
 * 세션 자동 보상은 metadata.sessionId + metadata.autoReward=true 마킹.
 * 동일 세션 재발급 시도 시 호출처에서 본 함수로 중복 검출.
 *
 * 인덱스: `credit_transactions_metadata_sessionId_autoReward` (partial sparse).
 * 한 세션의 자동 보상 트랜잭션은 인원 수 내외라 limit 없음 (수십 건 이내).
 *
 * 사용처: /api/erp/admin/credits/sessions (POST).
 */
export async function findTransactionsBySessionMetadata(
  sessionId: string
): Promise<CreditTransaction[]> {
  if (!sessionId) return [];
  const col = await creditTransactionsCol();
  return col
    .find({
      "metadata.sessionId": sessionId,
      "metadata.autoReward": true,
    })
    .sort({ createdAt: -1 })
    .toArray();
}
