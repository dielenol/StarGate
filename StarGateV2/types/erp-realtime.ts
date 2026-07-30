export interface UpcomingSessionLink {
  _id: string;
  title: string;
  targetDateTime: string;
  guildId: string;
  channelId: string;
  messageId: string;
}

export interface UpcomingSessionsResponse {
  sessions: UpcomingSessionLink[];
}

export type FactionBoardCode = string;
export type FactionBoardNodeKind =
  | "external"
  | "branch"
  | "internal"
  | "hostile";

export interface FactionBoardNode {
  code: FactionBoardCode;
  label: string;
  labelEn: string;
  kind: FactionBoardNodeKind;
  scopeLabel: string;
  parentCode: FactionBoardCode | null;
  parentLabel?: string;
  summary: string;
  doctrine: string;
  briefingPoints?: readonly string[];
  logoUrl: string;
  favorability: number | null;
  memberCount: number;
  contactCount: number;
  wikiCount: number;
  signalCount: number;
  subUnitCount?: number;
}

export interface FactionBoardTotals {
  nodeCount: number;
  factionCount: number;
  internalCount: number;
  subOrgCount: number;
  memberCount: number;
  contactCount: number;
  wikiCount: number;
  signalCount: number;
}

export interface FactionBoardData {
  boardNodes: FactionBoardNode[];
  totals: FactionBoardTotals;
  generatedAt: string;
  canEditFavorability: boolean;
}

export interface CurrentAccountResponse {
  id: string;
  username: string;
  displayName: string;
  discordId: string | null;
  discordUsername: string | null;
  discordGlobalName: string | null;
  discordAvatar: string | null;
  role: import("./user").UserRole;
  status: import("./user").UserStatus;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInventoryOverviewResponse {
  characters: Array<{
    id: string;
    codename: string;
    type: import("./character").Character["type"];
    name: string;
  }>;
  availableItems: Array<{
    id: string;
    name: string;
    category: import("./inventory").ItemCategory;
  }>;
  sharedInventoryCount: number;
}

export interface ErpDashboardSession {
  _id: string;
  title: string;
  targetDateTime: string;
  status: import("./session").SessionStatus;
  guildId: string;
  channelId: string;
  messageId: string;
}

export interface ErpDashboardWikiChange {
  _id: string;
  title: string;
  updatedAt: string;
}

export interface ErpDashboardResponse {
  displayCharacter: import("./character").Character | null;
  balance: number;
  characterPointBalance: number | null;
  characterPointHref: string;
  discordLinked: boolean;
  joinedDays: number;
  mainIntegrityError: string | null;
  myCharacterCount: number;
  myRsvpUpcoming: ErpDashboardSession[];
  mySessionCount: number | null;
  notificationPreview: import("./notification").ClientNotification[];
  pendingResponse: ErpDashboardSession[];
  recentWikis: ErpDashboardWikiChange[];
  todaySessionCount: number;
  unreadCount: number;
}

export interface SerializedFactionRelationLog {
  id: string;
  kind: "ACTION" | "SUPPORT" | "QUEST_ACCEPT" | "QUEST_COMPLETE";
  title: string;
  detail: string;
  delta: number;
  favorabilityBefore: number;
  favorabilityAfter: number;
  actorName: string;
  createdAt: string;
  characterCodename: string | null;
  creditCost: number | null;
  questId: string | null;
}

export interface SerializedFactionQuestProgress {
  id: string;
  questId: string;
  status: "ACTIVE" | "COMPLETED";
  title: string;
  actorName: string;
  startedAt: string;
  updatedAt: string;
  characterCodename: string | null;
  completedAt: string | null;
}

export interface FactionActivityResponse {
  favorability: number;
  logs: SerializedFactionRelationLog[];
  questProgress: SerializedFactionQuestProgress[];
}
