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
  AgentLevel,
  DepartmentCode,
  SheetBase,
  Equipment,
  Ability,
  AgentSheet,
  NpcSheet,
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
} from "./types/index.js";

export {
  USER_ROLES,
  USER_STATUSES,
  AGENT_LEVELS,
  AGENT_LEVEL_LABELS,
  DEPARTMENTS,
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
} from "./collections.js";

/* ── Indexes ── */

export { ensureAllIndexes } from "./indexes.js";

/* ── Utils ── */

export { isValidObjectId } from "./utils.js";

/* ── CRUD ── */

export * from "./crud/index.js";
