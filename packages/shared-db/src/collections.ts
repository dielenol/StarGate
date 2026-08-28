import type { Collection } from "mongodb";

import type { User } from "./types/user.js";
import type { Session, SessionResponse } from "./types/session.js";
import type { SessionLog } from "./types/session-log.js";
import type { RegistrarUserTip } from "./types/user-tip.js";
import type { Character } from "./types/character.js";
import type { CreditBalance, CreditTransaction } from "./types/credit.js";
import type {
  MasterItem,
  CharacterInventory,
  SharedInventory,
} from "./types/inventory.js";
import type { WikiPage, WikiPageRevision } from "./types/wiki.js";
import type { SessionReport } from "./types/session-report.js";
import type { Notification } from "./types/notification.js";
import type {
  HonorReviewState,
  HonorRecord,
} from "./types/honor.js";
import type { FactionDoc } from "./schemas/faction.schema.js";
import type { InstitutionDoc } from "./schemas/institution.schema.js";
import type { CreditPool } from "./types/credit-pool.js";
import type { ShopInventory, ShopDailyStock } from "./types/shop.js";
import type {
  StockPrice,
  StockHolding,
  MrBeastSodaStockImpactDemand,
  StockPriceHistory,
} from "./types/stock.js";
import type { PlayerTrade } from "./types/trade.js";
import type { TrpgSession } from "./types/trpg-session.js";
import type { TrpgGuildMember } from "./types/trpg-guild-member.js";
import type { TrpgSessionNotification } from "./types/trpg-session-notification.js";
import type {
  IntegrationOutboxEvent,
  ScheduledJobRun,
  WorkerCheckpoint,
  WorkerOperationalIncident,
} from "./types/worker.js";
import type {
  LoreAlias,
  LoreClaim,
  LoreEdge,
  LoreIngestionRun,
  LoreSearchDocument,
  LoreSource,
} from "./types/lore-knowledge.js";
import type { BureaucratVote } from "./types/bureaucrat-vote.js";
import type {
  NpcConversation,
  NpcRelationship,
  NpcRelationshipEvent,
  ResearchLabJob,
  ResearchLabLine,
} from "./types/research-lab.js";

import { getDb, getDbSync } from "./client.js";

type HonorReviewLockStorage = {
  /** 공적 검토 적용이 source identity 변경과 충돌하도록 쓰는 비공개 CAS 필드. */
  __honorAnalysisLockAt?: Date;
};
type UserStorage = User & HonorReviewLockStorage;
type CharacterStorage = Character & HonorReviewLockStorage;
type SessionReportStorage = SessionReport & HonorReviewLockStorage;

/* ── Collection names ── */

const COL = {
  USERS: "users",
  CHARACTERS: "characters",
  CREDIT_TRANSACTIONS: "credit_transactions",
  CREDIT_BALANCES: "credit_balances",
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
  MRBEAST_SODA_STOCK_IMPACT_DEMAND: "mrbeast_soda_stock_impact_demand",
  PLAYER_TRADES: "player_trades",
  TRPG_SESSIONS: "trpg_sessions",
  TRPG_GUILD_MEMBERS: "trpg_guild_members",
  TRPG_SESSION_NOTIFICATIONS: "trpg_session_notifications",
  SCHEDULED_JOB_RUNS: "scheduled_job_runs",
  INTEGRATION_OUTBOX: "integration_outbox",
  WORKER_CHECKPOINTS: "worker_checkpoints",
  WORKER_OPERATIONAL_INCIDENTS: "worker_operational_incidents",
  LORE_SOURCES: "lore_sources",
  LORE_ALIASES: "lore_aliases",
  LORE_EDGES: "lore_edges",
  LORE_CLAIMS: "lore_claims",
  LORE_SEARCH_DOCUMENTS: "lore_search_documents",
  LORE_INGESTION_RUNS: "lore_ingestion_runs",
  BUREAUCRAT_VOTES: "bureaucrat_votes",
  RESEARCH_LAB_LINES: "research_lab_lines",
  RESEARCH_LAB_JOBS: "research_lab_jobs",
  NPC_RELATIONSHIPS: "npc_relationships",
  NPC_RELATIONSHIP_EVENTS: "npc_relationship_events",
  NPC_CONVERSATIONS: "npc_conversations",
  HONOR_RECORDS: "honor_records",
  HONOR_ANALYSIS_STATES: "honor_analysis_states",
} as const;

/* ── Async accessors (both modes) ── */

export async function usersCol(): Promise<Collection<UserStorage>> {
  const db = await getDb();
  return db.collection<UserStorage>(COL.USERS);
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

export async function charactersCol(): Promise<Collection<CharacterStorage>> {
  const db = await getDb();
  return db.collection<CharacterStorage>(COL.CHARACTERS);
}

export async function creditTransactionsCol(): Promise<Collection<CreditTransaction>> {
  const db = await getDb();
  return db.collection<CreditTransaction>(COL.CREDIT_TRANSACTIONS);
}

export async function creditBalancesCol(): Promise<Collection<CreditBalance>> {
  const db = await getDb();
  return db.collection<CreditBalance>(COL.CREDIT_BALANCES);
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

export async function sessionReportsCol(): Promise<Collection<SessionReportStorage>> {
  const db = await getDb();
  return db.collection<SessionReportStorage>(COL.SESSION_REPORTS);
}

export async function notificationsCol(): Promise<Collection<Notification>> {
  const db = await getDb();
  return db.collection<Notification>(COL.NOTIFICATIONS);
}

export async function honorRecordsCol(): Promise<Collection<HonorRecord>> {
  const db = await getDb();
  return db.collection<HonorRecord>(COL.HONOR_RECORDS);
}

export async function honorAnalysisStatesCol(): Promise<
  Collection<HonorReviewState>
> {
  const db = await getDb();
  return db.collection<HonorReviewState>(COL.HONOR_ANALYSIS_STATES);
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

export async function playerTradesCol(): Promise<Collection<PlayerTrade>> {
  const db = await getDb();
  return db.collection<PlayerTrade>(COL.PLAYER_TRADES);
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

export async function scheduledJobRunsCol(): Promise<Collection<ScheduledJobRun>> {
  const db = await getDb();
  return db.collection<ScheduledJobRun>(COL.SCHEDULED_JOB_RUNS);
}

export async function integrationOutboxCol(): Promise<Collection<IntegrationOutboxEvent>> {
  const db = await getDb();
  return db.collection<IntegrationOutboxEvent>(COL.INTEGRATION_OUTBOX);
}

export async function mrBeastSodaStockImpactDemandCol(): Promise<
  Collection<MrBeastSodaStockImpactDemand>
> {
  const db = await getDb();
  return db.collection<MrBeastSodaStockImpactDemand>(
    COL.MRBEAST_SODA_STOCK_IMPACT_DEMAND,
  );
}

export async function workerCheckpointsCol(): Promise<Collection<WorkerCheckpoint>> {
  const db = await getDb();
  return db.collection<WorkerCheckpoint>(COL.WORKER_CHECKPOINTS);
}

export async function workerOperationalIncidentsCol(): Promise<
  Collection<WorkerOperationalIncident>
> {
  const db = await getDb();
  return db.collection<WorkerOperationalIncident>(
    COL.WORKER_OPERATIONAL_INCIDENTS,
  );
}

export async function loreSourcesCol(): Promise<Collection<LoreSource>> {
  const db = await getDb();
  return db.collection<LoreSource>(COL.LORE_SOURCES);
}

export async function loreAliasesCol(): Promise<Collection<LoreAlias>> {
  const db = await getDb();
  return db.collection<LoreAlias>(COL.LORE_ALIASES);
}

export async function loreEdgesCol(): Promise<Collection<LoreEdge>> {
  const db = await getDb();
  return db.collection<LoreEdge>(COL.LORE_EDGES);
}

export async function loreClaimsCol(): Promise<Collection<LoreClaim>> {
  const db = await getDb();
  return db.collection<LoreClaim>(COL.LORE_CLAIMS);
}

export async function loreSearchDocumentsCol(): Promise<Collection<LoreSearchDocument>> {
  const db = await getDb();
  return db.collection<LoreSearchDocument>(COL.LORE_SEARCH_DOCUMENTS);
}

export async function loreIngestionRunsCol(): Promise<Collection<LoreIngestionRun>> {
  const db = await getDb();
  return db.collection<LoreIngestionRun>(COL.LORE_INGESTION_RUNS);
}

export async function bureaucratVotesCol(): Promise<Collection<BureaucratVote>> {
  const db = await getDb();
  return db.collection<BureaucratVote>(COL.BUREAUCRAT_VOTES);
}

export async function researchLabLinesCol(): Promise<Collection<ResearchLabLine>> {
  const db = await getDb();
  return db.collection<ResearchLabLine>(COL.RESEARCH_LAB_LINES);
}

export async function researchLabJobsCol(): Promise<Collection<ResearchLabJob>> {
  const db = await getDb();
  return db.collection<ResearchLabJob>(COL.RESEARCH_LAB_JOBS);
}

export async function npcRelationshipsCol(): Promise<Collection<NpcRelationship>> {
  const db = await getDb();
  return db.collection<NpcRelationship>(COL.NPC_RELATIONSHIPS);
}

export async function npcRelationshipEventsCol(): Promise<Collection<NpcRelationshipEvent>> {
  const db = await getDb();
  return db.collection<NpcRelationshipEvent>(COL.NPC_RELATIONSHIP_EVENTS);
}

export async function npcConversationsCol(): Promise<Collection<NpcConversation>> {
  const db = await getDb();
  return db.collection<NpcConversation>(COL.NPC_CONVERSATIONS);
}

/* ── Sync accessors (long-running only) ── */

export function usersColSync(): Collection<UserStorage> {
  return getDbSync().collection<UserStorage>(COL.USERS);
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

export function charactersColSync(): Collection<CharacterStorage> {
  return getDbSync().collection<CharacterStorage>(COL.CHARACTERS);
}

export function creditTransactionsColSync(): Collection<CreditTransaction> {
  return getDbSync().collection<CreditTransaction>(COL.CREDIT_TRANSACTIONS);
}

export function creditBalancesColSync(): Collection<CreditBalance> {
  return getDbSync().collection<CreditBalance>(COL.CREDIT_BALANCES);
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

export function sessionReportsColSync(): Collection<SessionReportStorage> {
  return getDbSync().collection<SessionReportStorage>(COL.SESSION_REPORTS);
}

export function notificationsColSync(): Collection<Notification> {
  return getDbSync().collection<Notification>(COL.NOTIFICATIONS);
}

export function honorRecordsColSync(): Collection<HonorRecord> {
  return getDbSync().collection<HonorRecord>(COL.HONOR_RECORDS);
}

export function honorAnalysisStatesColSync(): Collection<HonorReviewState> {
  return getDbSync().collection<HonorReviewState>(
    COL.HONOR_ANALYSIS_STATES,
  );
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

export function playerTradesColSync(): Collection<PlayerTrade> {
  return getDbSync().collection<PlayerTrade>(COL.PLAYER_TRADES);
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

export function scheduledJobRunsColSync(): Collection<ScheduledJobRun> {
  return getDbSync().collection<ScheduledJobRun>(COL.SCHEDULED_JOB_RUNS);
}

export function integrationOutboxColSync(): Collection<IntegrationOutboxEvent> {
  return getDbSync().collection<IntegrationOutboxEvent>(
    COL.INTEGRATION_OUTBOX,
  );
}

export function mrBeastSodaStockImpactDemandColSync(): Collection<
  MrBeastSodaStockImpactDemand
> {
  return getDbSync().collection<MrBeastSodaStockImpactDemand>(
    COL.MRBEAST_SODA_STOCK_IMPACT_DEMAND,
  );
}

export function workerCheckpointsColSync(): Collection<WorkerCheckpoint> {
  return getDbSync().collection<WorkerCheckpoint>(COL.WORKER_CHECKPOINTS);
}

export function workerOperationalIncidentsColSync(): Collection<WorkerOperationalIncident> {
  return getDbSync().collection<WorkerOperationalIncident>(
    COL.WORKER_OPERATIONAL_INCIDENTS,
  );
}

export function loreSourcesColSync(): Collection<LoreSource> {
  return getDbSync().collection<LoreSource>(COL.LORE_SOURCES);
}

export function loreAliasesColSync(): Collection<LoreAlias> {
  return getDbSync().collection<LoreAlias>(COL.LORE_ALIASES);
}

export function loreEdgesColSync(): Collection<LoreEdge> {
  return getDbSync().collection<LoreEdge>(COL.LORE_EDGES);
}

export function loreClaimsColSync(): Collection<LoreClaim> {
  return getDbSync().collection<LoreClaim>(COL.LORE_CLAIMS);
}

export function loreSearchDocumentsColSync(): Collection<LoreSearchDocument> {
  return getDbSync().collection<LoreSearchDocument>(COL.LORE_SEARCH_DOCUMENTS);
}

export function loreIngestionRunsColSync(): Collection<LoreIngestionRun> {
  return getDbSync().collection<LoreIngestionRun>(COL.LORE_INGESTION_RUNS);
}

export function bureaucratVotesColSync(): Collection<BureaucratVote> {
  return getDbSync().collection<BureaucratVote>(COL.BUREAUCRAT_VOTES);
}

export function researchLabLinesColSync(): Collection<ResearchLabLine> {
  return getDbSync().collection<ResearchLabLine>(COL.RESEARCH_LAB_LINES);
}

export function researchLabJobsColSync(): Collection<ResearchLabJob> {
  return getDbSync().collection<ResearchLabJob>(COL.RESEARCH_LAB_JOBS);
}

export function npcRelationshipsColSync(): Collection<NpcRelationship> {
  return getDbSync().collection<NpcRelationship>(COL.NPC_RELATIONSHIPS);
}

export function npcRelationshipEventsColSync(): Collection<NpcRelationshipEvent> {
  return getDbSync().collection<NpcRelationshipEvent>(
    COL.NPC_RELATIONSHIP_EVENTS,
  );
}

export function npcConversationsColSync(): Collection<NpcConversation> {
  return getDbSync().collection<NpcConversation>(COL.NPC_CONVERSATIONS);
}
