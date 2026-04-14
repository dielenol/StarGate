/**
 * stargate_erp DB 컬렉션 접근 헬퍼
 */

import type { Collection } from "mongodb";

import type { Character } from "@/types/character";
import type { CreditTransaction } from "@/types/credit";
import type { CharacterInventory, MasterItem } from "@/types/inventory";
import type { Notification } from "@/types/notification";
import type { SessionReport } from "@/types/session-report";
import type { User } from "@/types/user";
import type { WikiPage, WikiPageRevision } from "@/types/wiki";

import { getErpDb } from "./client";

export async function usersCollection(): Promise<Collection<User>> {
  const db = await getErpDb();
  return db.collection<User>("users");
}

export async function charactersCollection(): Promise<Collection<Character>> {
  const db = await getErpDb();
  return db.collection<Character>("characters");
}

export async function wikiPagesCollection(): Promise<Collection<WikiPage>> {
  const db = await getErpDb();
  return db.collection<WikiPage>("wiki_pages");
}

export async function wikiRevisionsCollection(): Promise<
  Collection<WikiPageRevision>
> {
  const db = await getErpDb();
  return db.collection<WikiPageRevision>("wiki_page_revisions");
}

export async function sessionReportsCollection(): Promise<
  Collection<SessionReport>
> {
  const db = await getErpDb();
  return db.collection<SessionReport>("session_reports");
}

export async function notificationsCollection(): Promise<
  Collection<Notification>
> {
  const db = await getErpDb();
  return db.collection<Notification>("notifications");
}

export async function creditTransactionsCollection(): Promise<
  Collection<CreditTransaction>
> {
  const db = await getErpDb();
  return db.collection<CreditTransaction>("credit_transactions");
}

export async function masterItemsCollection(): Promise<
  Collection<MasterItem>
> {
  const db = await getErpDb();
  return db.collection<MasterItem>("master_items");
}

export async function inventoryCollection(): Promise<
  Collection<CharacterInventory>
> {
  const db = await getErpDb();
  return db.collection<CharacterInventory>("character_inventory");
}
