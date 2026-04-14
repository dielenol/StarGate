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

/** 유저의 잔액 계산 후 트랜잭션 생성 (원자적이진 않으나 소규모에 충분) */
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
  const currentBalance = await getUserBalance(userId);
  const newBalance = currentBalance + amount;

  return createCreditTransaction({
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
  });
}
