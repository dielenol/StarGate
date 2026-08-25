import type { RealtimeResource } from "@stargate/core";

export const COLLECTION_RESOURCE_MAP = {
  users: ["users", "personnel"],
  characters: ["characters", "personnel"],
  character_change_logs: ["characters"],
  credit_transactions: ["credits"],
  credit_balances: ["credits"],
  credit_pools: ["credits"],
  character_inventory: ["inventory"],
  shared_inventory: ["inventory"],
  master_items: ["inventory"],
  notifications: ["notifications"],
  shop_inventory: ["shop"],
  shop_daily_stock: ["shop"],
  shop_runtime_state: ["shop"],
  shop_stock_audit_logs: ["shop"],
  shop_reorder_requests: ["shop"],
  shop_restock_notifications: ["shop"],
  stock_prices: ["stocks"],
  stock_holdings: ["stocks"],
  stock_price_history: ["stocks"],
  stock_market_state: ["stocks"],
  stock_market_calendar_exceptions: ["stocks"],
  stock_order_flow: ["stocks"],
  stock_disclosures: ["stocks"],
  stock_company_profiles: ["stocks"],
  stock_market_preferences: ["stocks"],
  stock_corporate_actions: ["stocks"],
  stock_dividend_entitlements: ["stocks"],
  stock_investment_seasons: ["stocks", "hall-of-fame"],
  stock_season_performance: ["stocks", "hall-of-fame"],
  stock_season_flows: ["stocks"],
  stock_discord_market_wires: ["stocks"],
  player_trades: ["trades"],
  sessions: ["sessions"],
  session_responses: ["sessions"],
  trpg_sessions: ["sessions"],
  trpg_session_notifications: ["sessions"],
  session_reports: ["reports", "hall-of-fame"],
  gallery_fanarts: ["gallery"],
  equipment_workshop_requests: ["equipment-shop"],
  equipment_workshop_blueprints: ["equipment-shop"],
  equipment_license_tests: ["equipment-shop"],
  equipment_license_test_requests: ["equipment-shop"],
  research_projects: ["equipment-shop"],
  research_team_funding_pools: ["equipment-shop"],
  research_contributions: ["equipment-shop"],
  research_discord_cards: ["equipment-shop"],
  research_ranking_states: ["hall-of-fame"],
  honor_records: ["hall-of-fame"],
  wiki_pages: ["wiki"],
  wiki_page_revisions: ["wiki"],
  factions: ["factions"],
  institutions: ["factions"],
  faction_relation_logs: ["factions"],
  faction_quest_progress: ["factions"],
  faction_favorability: ["factions"],
  erp_page_locks: ["page-locks"],
} as const satisfies Record<string, readonly RealtimeResource[]>;

export const REALTIME_CHANGE_STREAM_COLLECTIONS = Object.freeze(
  Object.keys(COLLECTION_RESOURCE_MAP),
);

export interface RealtimeDatabaseChange {
  collectionName: string;
  operationType: string;
  documentId?: string;
  updatedFields: string[];
  audienceUserIds?: string[];
}

export interface MappedRealtimeChange {
  resources: RealtimeResource[];
  audienceUserIds?: string[];
  disconnectUserId?: string;
}

function shouldReauthenticateUser(change: RealtimeDatabaseChange): boolean {
  if (change.collectionName !== "users" || !change.documentId) return false;
  if (change.operationType === "delete") return true;
  if (change.operationType === "replace") return true;
  return change.updatedFields.some(
    (field) =>
      field === "role" ||
      field.startsWith("role.") ||
      field === "status" ||
      field.startsWith("status."),
  );
}

function changesHallOfFameSnapshot(change: RealtimeDatabaseChange): boolean {
  if (change.collectionName !== "research_ranking_states") return true;
  if (change.operationType !== "update") return true;
  return change.updatedFields.some(
    (field) =>
      field === "publicSnapshot" || field.startsWith("publicSnapshot."),
  );
}

export function mapRealtimeChange(
  change: RealtimeDatabaseChange,
): MappedRealtimeChange | null {
  if (!changesHallOfFameSnapshot(change)) return null;
  const resources =
    COLLECTION_RESOURCE_MAP[
      change.collectionName as keyof typeof COLLECTION_RESOURCE_MAP
    ];
  if (!resources) return null;

  return {
    resources: [...resources],
    ...(change.audienceUserIds
      ? { audienceUserIds: [...new Set(change.audienceUserIds)] }
      : {}),
    ...(shouldReauthenticateUser(change)
      ? { disconnectUserId: change.documentId }
      : {}),
  };
}
