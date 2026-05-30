/* ── Types ── */

export type {
  User,
  UserRole,
  UserStatus,
  UserPublic,
  CreateUserInput,
  Session,
  SessionResponse,
  SessionStatus,
  ResponseStatus,
  ResponseCounts,
  SessionFinalizationKind,
  SessionLog,
  SessionLogType,
  Character,
  AgentCharacter,
  NpcCharacter,
  CharacterType,
  CharacterTier,
  AgentLevel,
  RoleLevel,
  DepartmentCode,
  FactionCode,
  InstitutionCode,
  LegacyDepartmentCode,
  LoreSheet,
  PlaySheet,
  Equipment,
  Ability,
  AbilitySlot,
  CreateCharacterInput,
  CharacterPublic,
  CreditTransaction,
  CreditTransactionType,
  CreateCreditTransactionInput,
  WebAllowedCreditType,
  GmDirectGrantType,
  BotOnlyCreditType,
  MasterItem,
  CharacterInventory,
  ItemCategory,
  ShopMeta,
  ShopPageGroup,
  CreateMasterItemInput,
  CreateInventoryInput,
  WikiPage,
  WikiPageLite,
  WikiPageRevision,
  CreateWikiPageInput,
  UpdateWikiPageInput,
  Notification,
  NotificationType,
  CreateNotificationInput,
  SessionReport,
  SessionReportMapPrecision,
  CreateSessionReportInput,
  RegistrarUserTip,
  CharacterChangeLog,
  CharacterChangeLogEntry,
  NewCharacterChangeLog,
  CreditPool,
  CreateCreditPoolInput,
  ShopInventory,
  ShopDailyStock,
  CreateShopInventoryInput,
  CreateShopDailyStockInput,
  StockPrice,
  StockHolding,
  StockPriceHistory,
  CreateStockPriceInput,
  CreateStockHoldingInput,
  CreateStockPriceHistoryInput,
  TrpgSession,
  TrpgSessionStatus,
  UpdateTrpgSessionResult,
  CancelTrpgSessionResult,
  TrpgGuildMember,
  TrpgSessionNotification,
  TrpgNotificationKind,
  TrpgNotificationDeliveryMethod,
} from "./types/index.js";

export {
  USER_ROLES,
  USER_STATUSES,
  AGENT_LEVELS,
  AGENT_LEVEL_LABELS,
  CHARACTER_TIERS,
  ROLE_LEVELS,
  ROLE_LEVEL_RANK,
  DEPARTMENTS,
  FACTIONS,
  INSTITUTIONS,
  INTERNAL_FACTION_CODE,
  CREDIT_TRANSACTION_TYPES,
  WEB_ALLOWED_CREDIT_TYPES,
  GM_DIRECT_GRANT_TYPES,
  BOT_ONLY_CREDIT_TYPES,
  isGmDirectGrantType,
  ITEM_CATEGORIES,
  OPERATION_POOL_ID,
  OPERATION_POOL_DEFAULT_NAME,
  OPERATION_POOL_INITIAL_BALANCE,
} from "./types/index.js";

/* ── Client ── */

export type { SharedDbConfig } from "./client.js";
export {
  initServerless,
  connect,
  close,
  getClient,
  getDb,
  getClientSync,
  getDbSync,
} from "./client.js";

/* ── Collections (async) ── */

export {
  usersCol,
  sessionsCol,
  sessionResponsesCol,
  sessionLogsCol,
  userTipsCol,
  charactersCol,
  creditTransactionsCol,
  masterItemsCol,
  characterInventoryCol,
  wikiPagesCol,
  wikiPageRevisionsCol,
  sessionReportsCol,
  notificationsCol,
  factionsCol,
  institutionsCol,
  creditPoolsCol,
  shopInventoryCol,
  shopDailyStockCol,
  stockPricesCol,
  stockHoldingsCol,
  stockPriceHistoryCol,
  trpgSessionsCol,
  trpgGuildMembersCol,
  trpgSessionNotificationsCol,
} from "./collections.js";

/* ── Collections (sync, long-running only) ── */

export {
  usersColSync,
  sessionsColSync,
  sessionResponsesColSync,
  sessionLogsColSync,
  userTipsColSync,
  charactersColSync,
  creditTransactionsColSync,
  masterItemsColSync,
  characterInventoryColSync,
  wikiPagesColSync,
  wikiPageRevisionsColSync,
  sessionReportsColSync,
  notificationsColSync,
  factionsColSync,
  institutionsColSync,
  creditPoolsColSync,
  shopInventoryColSync,
  shopDailyStockColSync,
  stockPricesColSync,
  stockHoldingsColSync,
  stockPriceHistoryColSync,
  trpgSessionsColSync,
  trpgGuildMembersColSync,
  trpgSessionNotificationsColSync,
} from "./collections.js";

/* ── Indexes ── */

export { ensureAllIndexes } from "./indexes.js";
export { ensureChangeLogsIndexes } from "./migrations/ensure-change-logs-indexes.js";

/* ── Utils ── */

export { isValidObjectId } from "./utils.js";

/* ── CRUD ── */

export * from "./crud/index.js";

/* ── Schemas (zod) ── */

export * from "./schemas/index.js";
