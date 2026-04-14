/**
 * stargate_erp DB 컬렉션 접근 헬퍼
 */

import type { Collection } from "mongodb";

import type { User } from "@/types/user";

import { getErpDb } from "./client";

export async function usersCollection(): Promise<Collection<User>> {
  const db = await getErpDb();
  return db.collection<User>("users");
}
