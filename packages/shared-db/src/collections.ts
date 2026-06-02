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
  SharedInventory,
} from "./types/inventory.js";
import type { WikiPage, WikiPageRevision } from "./types/wiki.js";
import type { SessionReport } from "./types/session-report.js";
import type { Notification } from "./types/notification.js";
import type { FactionDoc } from "./schemas/faction.schema.js";
import type { InstitutionDoc } from "./schemas/institution.schema.js";
import type { CreditPool } from "./types/credit-pool.js";
import type { ShopInventory, ShopDailyStock } from "./types/shop.js";
import type {
  StockPrice,
  StockHolding,
  StockPriceHistory,
} from "./types/stock.js";
import type { TrpgSession } from "./types/trpg-session.js";
import type { TrpgGuildMember } from "./types/trpg-guild-member.js";
import type { TrpgSessionNotification } from "./types/trpg-session-notification.js";

import { getDb, getDbSync } from "./client.js";

/* ── Collection names ── */

const COL = {
  USERS: "users",
  CHARACTERS: "characters",
  CREDIT_TRANSACTIONS: "credit_transactions",
  MASTER_ITEMS: "master_items",
  CHARACTER_INVENTORY: "character_inventory",
  SHARED_INVENTORY: "shared_inventory",
  WIKI_PAGES: "wiki_pages",
  WIKI_PAGE_REVISIONS: "wiki_page_revisions",
  SESSION_REPORTS: "session_reports",
  NOTIFICATIONS: "notifications",
  SESSIONS: "sessions",
  SESSION_RESPONSES: "session_responses",
  SESSION_LOGS: "session_logs",
  REGISTRAR_USER_TIPS: "registrar_user_tips",
  FACTIONS: "factions",
  INSTITUTIONS: "institutions",
  CREDIT_POOLS: "credit_pools",
  SHOP_INVENTORY: "shop_inventory",
  SHOP_DAILY_STOCK: "shop_daily_stock",
  STOCK_PRICES: "stock_prices",
  STOCK_HOLDINGS: "stock_holdings",
  STOCK_PRICE_HISTORY: "stock_price_history",
  TRPG_SESSIONS: "trpg_sessions",
  TRPG_GUILD_MEMBERS: "trpg_guild_members",
  TRPG_SESSION_NOTIFICATIONS: "trpg_session_notifications",
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

export async function sharedInventoryCol(): Promise<Collection<SharedInventory>> {
  const db = await getDb();
  return db.collection<SharedInventory>(COL.SHARED_INVENTORY);
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

export async function factionsCol(): Promise<Collection<FactionDoc>> {
  const db = await getDb();
  return db.collection<FactionDoc>(COL.FACTIONS);
}

export async function institutionsCol(): Promise<Collection<InstitutionDoc>> {
  const db = await getDb();
  return db.collection<InstitutionDoc>(COL.INSTITUTIONS);
}

export async function creditPoolsCol(): Promise<Collection<CreditPool>> {
  const db = await getDb();
  return db.collection<CreditPool>(COL.CREDIT_POOLS);
}

export async function shopInventoryCol(): Promise<Collection<ShopInventory>> {
  const db = await getDb();
  return db.collection<ShopInventory>(COL.SHOP_INVENTORY);
}

export async function shopDailyStockCol(): Promise<Collection<ShopDailyStock>> {
  const db = await getDb();
  return db.collection<ShopDailyStock>(COL.SHOP_DAILY_STOCK);
}

export async function stockPricesCol(): Promise<Collection<StockPrice>> {
  const db = await getDb();
  return db.collection<StockPrice>(COL.STOCK_PRICES);
}

export async function stockHoldingsCol(): Promise<Collection<StockHolding>> {
  const db = await getDb();
  return db.collection<StockHolding>(COL.STOCK_HOLDINGS);
}

export async function stockPriceHistoryCol(): Promise<Collection<StockPriceHistory>> {
  const db = await getDb();
  return db.collection<StockPriceHistory>(COL.STOCK_PRICE_HISTORY);
}

export async function trpgSessionsCol(): Promise<Collection<TrpgSession>> {
  const db = await getDb();
  return db.collection<TrpgSession>(COL.TRPG_SESSIONS);
}

export async function trpgGuildMembersCol(): Promise<Collection<TrpgGuildMember>> {
  const db = await getDb();
  return db.collection<TrpgGuildMember>(COL.TRPG_GUILD_MEMBERS);
}

export async function trpgSessionNotificationsCol(): Promise<Collection<TrpgSessionNotification>> {
  const db = await getDb();
  return db.collection<TrpgSessionNotification>(COL.TRPG_SESSION_NOTIFICATIONS);
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

export function sharedInventoryColSync(): Collection<SharedInventory> {
  return getDbSync().collection<SharedInventory>(COL.SHARED_INVENTORY);
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

export function factionsColSync(): Collection<FactionDoc> {
  return getDbSync().collection<FactionDoc>(COL.FACTIONS);
}

export function institutionsColSync(): Collection<InstitutionDoc> {
  return getDbSync().collection<InstitutionDoc>(COL.INSTITUTIONS);
}

export function creditPoolsColSync(): Collection<CreditPool> {
  return getDbSync().collection<CreditPool>(COL.CREDIT_POOLS);
}

export function shopInventoryColSync(): Collection<ShopInventory> {
  return getDbSync().collection<ShopInventory>(COL.SHOP_INVENTORY);
}

export function shopDailyStockColSync(): Collection<ShopDailyStock> {
  return getDbSync().collection<ShopDailyStock>(COL.SHOP_DAILY_STOCK);
}

export function stockPricesColSync(): Collection<StockPrice> {
  return getDbSync().collection<StockPrice>(COL.STOCK_PRICES);
}

export function stockHoldingsColSync(): Collection<StockHolding> {
  return getDbSync().collection<StockHolding>(COL.STOCK_HOLDINGS);
}

export function stockPriceHistoryColSync(): Collection<StockPriceHistory> {
  return getDbSync().collection<StockPriceHistory>(COL.STOCK_PRICE_HISTORY);
}

export function trpgSessionsColSync(): Collection<TrpgSession> {
  return getDbSync().collection<TrpgSession>(COL.TRPG_SESSIONS);
}

export function trpgGuildMembersColSync(): Collection<TrpgGuildMember> {
  return getDbSync().collection<TrpgGuildMember>(COL.TRPG_GUILD_MEMBERS);
}

export function trpgSessionNotificationsColSync(): Collection<TrpgSessionNotification> {
  return getDbSync().collection<TrpgSessionNotification>(
    COL.TRPG_SESSION_NOTIFICATIONS,
  );
}
