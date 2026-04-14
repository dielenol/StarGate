import type { ObjectId } from "mongodb";

export type CreditTransactionType =
  | "SESSION_REWARD"
  | "PURCHASE"
  | "ADMIN_GRANT"
  | "ADMIN_DEDUCT"
  | "TRANSFER";

export interface CreditTransaction {
  _id?: ObjectId;
  userId: string;
  userName: string;
  characterId?: string;
  characterCodename?: string;
  type: CreditTransactionType;
  amount: number;
  balance: number;
  description: string;
  createdById: string;
  createdByName: string;
  createdAt: Date;
}

export type CreateCreditTransactionInput = Omit<
  CreditTransaction,
  "_id" | "createdAt"
>;
