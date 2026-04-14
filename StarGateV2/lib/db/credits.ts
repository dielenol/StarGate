/**
 * credit_transactions CRUD
 */

import { ObjectId } from "mongodb";

import type {
  CreateCreditTransactionInput,
  CreditTransaction,
} from "@/types/credit";

import { creditTransactionsCollection } from "./collections";

export async function listCreditTransactions(
  userId?: string,
  limit = 100,
): Promise<CreditTransaction[]> {
  const col = await creditTransactionsCollection();
  const filter = userId ? { userId } : {};
  return col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function getUserBalance(userId: string): Promise<number> {
  const col = await creditTransactionsCollection();
  const latest = await col
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  return latest[0]?.balance ?? 0;
}

export async function createCreditTransaction(
  input: CreateCreditTransactionInput,
): Promise<CreditTransaction> {
  const col = await creditTransactionsCollection();
  const doc: CreditTransaction = { ...input, createdAt: new Date() };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findTransactionById(
  id: string,
): Promise<CreditTransaction | null> {
  const col = await creditTransactionsCollection();
  return col.findOne({ _id: new ObjectId(id) });
}

/** 유저의 잔액 계산 후 트랜잭션 생성 — 잔액 조회+생성 사이 레이스 방지를 위해 직렬 처리 */
export async function addCredit(
  userId: string,
  userName: string,
  amount: number,
  type: CreditTransaction["type"],
  description: string,
  createdById: string,
  createdByName: string,
  characterId?: string,
  characterCodename?: string,
): Promise<CreditTransaction> {
  const col = await creditTransactionsCollection();

  // 최신 잔액을 조회하고 즉시 새 트랜잭션 삽입 (단일 컬렉션이므로 findOneAndUpdate 불가, 대신 정렬 기반)
  const latest = await col
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  const currentBalance = latest[0]?.balance ?? 0;
  const newBalance = currentBalance + amount;

  const doc: CreditTransaction = {
    userId,
    userName,
    characterId,
    characterCodename,
    type,
    amount,
    balance: newBalance,
    description,
    createdById,
    createdByName,
    createdAt: new Date(),
  };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}
