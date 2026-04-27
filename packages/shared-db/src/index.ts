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
  MasterItem,
  CharacterInventory,
  ItemCategory,
  CreateMasterItemInput,
  CreateInventoryInput,
  WikiPage,
  WikiPageRevision,
  CreateWikiPageInput,
  UpdateWikiPageInput,
  Notification,
  NotificationType,
  CreateNotificationInput,
  SessionReport,
  CreateSessionReportInput,
  RegistrarUserTip,
  CharacterChangeLog,
  CharacterChangeLogEntry,
  NewCharacterChangeLog,
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
