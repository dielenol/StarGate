/**
 * credit_transactions CRUD — character 단위 ledger.
 *
 * Phase 2 에서 user 단위 → character 단위로 전환됨. NPC/MINI 는 ledger 대상 ❌
 * (AGENT + MAIN tier 만). owner 단위 조회는 `findMainCharacterByOwner` 로 메인
 * 캐릭터를 먼저 해석한 뒤 character 단위 함수를 호출한다.
 */

import { ObjectId } from "mongodb";

import type {
  CreateCreditTransactionInput,
  CreditTransaction,
} from "../types/index.js";

import { creditTransactionsCol } from "../collections.js";

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
  const newBalance = currentBalance + input.amount;

  if (newBalance < 0 && !input.allowNegative) {
    throw new Error(
      `addCredit: 음수 잔액 거부 — characterId=${input.characterId}, ` +
        `current=${currentBalance}, delta=${input.amount}. ` +
        `allowNegative 옵션이 필요한 호출이면 명시적으로 전달할 것.`
    );
  }

  const doc: CreditTransaction = {
    characterId: input.characterId,
    characterCodename: input.characterCodename,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    type: input.type,
    amount: input.amount,
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
