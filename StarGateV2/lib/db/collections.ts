/**
 * stargate_erp DB 컬렉션 접근 헬퍼
 */

import type { Collection } from "mongodb";

import type { Character } from "@/types/character";
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
