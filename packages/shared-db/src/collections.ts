import type { Collection } from "mongodb";

import type { User } from "./types/user.js";
import type { Session, SessionResponse } from "./types/session.js";
import type { SessionLog } from "./types/session-log.js";
import type { RegistrarUserTip } from "./types/user-tip.js";
import type { Character } from "./types/character.js";
import type { CreditTransaction } from "./types/credit.js";
import type {
  MasterItem,
  CharacterInventory,
} from "./types/inventory.js";
import type { WikiPage, WikiPageRevision } from "./types/wiki.js";
import type { SessionReport } from "./types/session-report.js";
import type { Notification } from "./types/notification.js";

import { getDb, getDbSync } from "./client.js";

/* ── Collection names ── */

const COL = {
  USERS: "users",
  CHARACTERS: "characters",
  CREDIT_TRANSACTIONS: "credit_transactions",
  MASTER_ITEMS: "master_items",
  CHARACTER_INVENTORY: "character_inventory",
  WIKI_PAGES: "wiki_pages",
  WIKI_PAGE_REVISIONS: "wiki_page_revisions",
  SESSION_REPORTS: "session_reports",
  NOTIFICATIONS: "notifications",
  SESSIONS: "sessions",
  SESSION_RESPONSES: "session_responses",
  SESSION_LOGS: "session_logs",
  REGISTRAR_USER_TIPS: "registrar_user_tips",
} as const;

/* ── Async accessors (both modes) ── */

export async function usersCol(): Promise<Collection<User>> {
  const db = await getDb();
  return db.collection<User>(COL.USERS);
}

export async function sessionsCol(): Promise<Collection<Session>> {
  const db = await getDb();
  return db.collection<Session>(COL.SESSIONS);
}

export async function sessionResponsesCol(): Promise<Collection<SessionResponse>> {
  const db = await getDb();
  return db.collection<SessionResponse>(COL.SESSION_RESPONSES);
}

export async function sessionLogsCol(): Promise<Collection<SessionLog>> {
  const db = await getDb();
  return db.collection<SessionLog>(COL.SESSION_LOGS);
}

export async function userTipsCol(): Promise<Collection<RegistrarUserTip>> {
  const db = await getDb();
  return db.collection<RegistrarUserTip>(COL.REGISTRAR_USER_TIPS);
}

export async function charactersCol(): Promise<Collection<Character>> {
  const db = await getDb();
  return db.collection<Character>(COL.CHARACTERS);
}

export async function creditTransactionsCol(): Promise<Collection<CreditTransaction>> {
  const db = await getDb();
  return db.collection<CreditTransaction>(COL.CREDIT_TRANSACTIONS);
}

export async function masterItemsCol(): Promise<Collection<MasterItem>> {
  const db = await getDb();
  return db.collection<MasterItem>(COL.MASTER_ITEMS);
}

export async function characterInventoryCol(): Promise<Collection<CharacterInventory>> {
  const db = await getDb();
  return db.collection<CharacterInventory>(COL.CHARACTER_INVENTORY);
}

export async function wikiPagesCol(): Promise<Collection<WikiPage>> {
  const db = await getDb();
  return db.collection<WikiPage>(COL.WIKI_PAGES);
}

export async function wikiPageRevisionsCol(): Promise<Collection<WikiPageRevision>> {
  const db = await getDb();
  return db.collection<WikiPageRevision>(COL.WIKI_PAGE_REVISIONS);
}

export async function sessionReportsCol(): Promise<Collection<SessionReport>> {
  const db = await getDb();
  return db.collection<SessionReport>(COL.SESSION_REPORTS);
}

export async function notificationsCol(): Promise<Collection<Notification>> {
  const db = await getDb();
  return db.collection<Notification>(COL.NOTIFICATIONS);
}

/* ── Sync accessors (long-running only) ── */

export function usersColSync(): Collection<User> {
  return getDbSync().collection<User>(COL.USERS);
}

export function sessionsColSync(): Collection<Session> {
  return getDbSync().collection<Session>(COL.SESSIONS);
}

export function sessionResponsesColSync(): Collection<SessionResponse> {
  return getDbSync().collection<SessionResponse>(COL.SESSION_RESPONSES);
}

export function sessionLogsColSync(): Collection<SessionLog> {
  return getDbSync().collection<SessionLog>(COL.SESSION_LOGS);
}

export function userTipsColSync(): Collection<RegistrarUserTip> {
  return getDbSync().collection<RegistrarUserTip>(COL.REGISTRAR_USER_TIPS);
}

export function charactersColSync(): Collection<Character> {
  return getDbSync().collection<Character>(COL.CHARACTERS);
}

export function creditTransactionsColSync(): Collection<CreditTransaction> {
  return getDbSync().collection<CreditTransaction>(COL.CREDIT_TRANSACTIONS);
}

export function masterItemsColSync(): Collection<MasterItem> {
  return getDbSync().collection<MasterItem>(COL.MASTER_ITEMS);
}

export function characterInventoryColSync(): Collection<CharacterInventory> {
  return getDbSync().collection<CharacterInventory>(COL.CHARACTER_INVENTORY);
}

export function wikiPagesColSync(): Collection<WikiPage> {
  return getDbSync().collection<WikiPage>(COL.WIKI_PAGES);
}

export function wikiPageRevisionsColSync(): Collection<WikiPageRevision> {
  return getDbSync().collection<WikiPageRevision>(COL.WIKI_PAGE_REVISIONS);
}

export function sessionReportsColSync(): Collection<SessionReport> {
  return getDbSync().collection<SessionReport>(COL.SESSION_REPORTS);
}

export function notificationsColSync(): Collection<Notification> {
  return getDbSync().collection<Notification>(COL.NOTIFICATIONS);
}
