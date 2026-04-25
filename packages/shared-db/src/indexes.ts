import { getDb } from "./client.js";
import { ensureChangeLogsIndexes } from "./migrations/ensure-change-logs-indexes.js";

/**
 * 모든 컬렉션의 인덱스를 생성한다.
 * long-running 모드에서는 connect() 후 직접 호출,
 * serverless 모드에서는 필요 시 빌드 스크립트 등에서 1회 실행.
 */
export async function ensureAllIndexes(): Promise<void> {
  const db = await getDb();

  await Promise.all([
    /* ── character_change_logs (감사 로그) ── */
    ensureChangeLogsIndexes(db),

    /* ── users (from StarGateV2) ── */
    db.collection("users").createIndexes([
      {
        key: { username: 1 },
        name: "users_username_unique",
        unique: true,
      },
      {
        key: { discordId: 1 },
        name: "users_discordId_partial_unique",
        unique: true,
        // partialFilterExpression: discordId가 string일 때만 unique 제약 적용.
        // sparse는 필드 누락만 제외하고 명시적 null은 포함하므로,
        // discordId:null 문서가 2개 이상이면 E11000 발생 → partial 로 교체.
        partialFilterExpression: { discordId: { $type: "string" } },
      },
    ]),

    /* ── characters (from StarGateV2) ── */
    db.collection("characters").createIndexes([
      {
        key: { codename: 1 },
        name: "characters_codename_unique",
        unique: true,
      },
      {
        key: { type: 1, isPublic: 1 },
        name: "characters_type_isPublic",
      },
      {
        key: { ownerId: 1 },
        name: "characters_ownerId",
      },
    ]),

    /* ── credit_transactions (from task spec) ── */
    db.collection("credit_transactions").createIndexes([
      {
        key: { userId: 1 },
        name: "credit_transactions_userId",
      },
      {
        key: { createdAt: -1 },
        name: "credit_transactions_createdAt",
      },
    ]),

    /* ── master_items (from task spec) ── */
    db.collection("master_items").createIndexes([
      {
        key: { category: 1 },
        name: "master_items_category",
      },
      {
        key: { isAvailable: 1 },
        name: "master_items_isAvailable",
      },
    ]),

    /* ── character_inventory (from task spec) ── */
    db.collection("character_inventory").createIndex(
      { characterId: 1, itemId: 1 },
      { name: "character_inventory_characterId_itemId" },
    ),

    /* ── wiki_pages (from StarGateV2) ── */
    db.collection("wiki_pages").createIndexes([
      {
        key: { slug: 1 },
        name: "wiki_pages_slug_unique",
        unique: true,
      },
      {
        key: { category: 1 },
        name: "wiki_pages_category",
      },
      {
        key: { tags: 1 },
        name: "wiki_pages_tags",
      },
      {
        key: { isPublic: 1 },
        name: "wiki_pages_isPublic",
      },
    ]),

    /* ── wiki_page_revisions (from StarGateV2) ── */
    db.collection("wiki_page_revisions").createIndex(
      { pageId: 1, createdAt: -1 },
      { name: "wiki_page_revisions_pageId_createdAt" },
    ),

    /* ── session_reports (from task spec) ── */
    db.collection("session_reports").createIndex(
      { sessionId: 1 },
      { name: "session_reports_sessionId" },
    ),

    /* ── notifications (from task spec) ── */
    db.collection("notifications").createIndex(
      { userId: 1, isRead: 1, createdAt: -1 },
      { name: "notifications_userId_isRead_createdAt" },
    ),

    /* ── sessions (from registra-bot) ── */
    db.collection("sessions").createIndexes([
      {
        key: { status: 1, closeDateTime: 1 },
        name: "sessions_status_closeDateTime",
      },
      {
        key: { guildId: 1, status: 1, createdAt: -1 },
        name: "sessions_guild_status_createdAt",
      },
      {
        key: { guildId: 1, status: 1, targetDateTime: 1 },
        name: "sessions_guild_status_targetDateTime",
      },
      {
        key: {
          status: 1,
          targetDateTime: 1,
          sessionStartReminder24hSent: 1,
          sessionStartReminder24hClaimLeaseUntil: 1,
        },
        name: "sessions_status_targetDateTime_reminderFlag_claimLease",
      },
    ]),

    /* ── session_responses (from registra-bot) ── */
    db.collection("session_responses").createIndexes([
      {
        key: { sessionId: 1, userId: 1 },
        name: "responses_sessionId_userId_unique",
        unique: true,
      },
      {
        key: { sessionId: 1, status: 1 },
        name: "responses_sessionId_status",
      },
      {
        key: { userId: 1, status: 1 },
        name: "responses_userId_status",
      },
    ]),

    /* ── session_logs (from registra-bot) ── */
    db.collection("session_logs").createIndex(
      { sessionId: 1, createdAt: -1 },
      { name: "session_logs_sessionId_createdAt" },
    ),

    /* ── registrar_user_tips (from registra-bot) ── */
    db.collection("registrar_user_tips").createIndex(
      { guildId: 1, userId: 1, tipId: 1 },
      {
        unique: true,
        name: "registrar_user_tips_guild_user_tip_unique",
      },
    ),

    /* ── factions (lore schemas) ── */
    db.collection("factions").createIndexes([
      {
        key: { code: 1 },
        name: "factions_code_unique",
        unique: true,
      },
      {
        key: { slug: 1 },
        name: "factions_slug_unique",
        unique: true,
      },
      {
        key: { isPublic: 1 },
        name: "factions_isPublic",
      },
    ]),

    /* ── institutions (lore schemas) ── */
    db.collection("institutions").createIndexes([
      {
        key: { code: 1 },
        name: "institutions_code_unique",
        unique: true,
      },
      {
        key: { slug: 1 },
        name: "institutions_slug_unique",
        unique: true,
      },
      {
        key: { parentFactionCode: 1 },
        name: "institutions_parentFactionCode",
      },
      {
        key: { isPublic: 1 },
        name: "institutions_isPublic",
      },
    ]),
  ]);
}
