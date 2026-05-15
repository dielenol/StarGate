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

    /* ── credit_transactions (Phase 2: character 단위 ledger) ── */
    db.collection("credit_transactions").createIndexes([
      // characterId 단위 ledger 조회 + balance 조회.
      {
        key: { characterId: 1, createdAt: -1 },
        name: "credit_transactions_characterId_createdAt",
      },
      // owner 역참조 (GM 검색 / owner 단위 audit).
      {
        key: { ownerId: 1, createdAt: -1 },
        name: "credit_transactions_ownerId_createdAt",
      },
      // tia_bot 통합 — metadata/type 기반 조회.
      {
        key: { "metadata.ticker": 1, createdAt: -1 },
        name: "credit_transactions_metadata_ticker",
        partialFilterExpression: { "metadata.ticker": { $type: "string" } },
      },
      {
        key: { "metadata.poolId": 1, createdAt: -1 },
        name: "credit_transactions_metadata_poolId",
        partialFilterExpression: { "metadata.poolId": { $type: "string" } },
      },
      {
        key: { type: 1, createdAt: -1 },
        name: "credit_transactions_type_createdAt",
      },
      // GM 운영 대시보드 — 세션 자동 보상 멱등 검출 (metadata.sessionId + autoReward=true).
      // partial index 로 자동 보상 트랜잭션만 색인 (수동 발급은 제외 → 인덱스 사이즈 최소화).
      // (sessionId, characterId) unique 로 두 GM 동시 발급 race 시 두 번째 insert 가
      // E11000 으로 실패 → 라우트가 catch 후 already-rewarded 분류. DB 레벨 backstop.
      {
        key: { "metadata.sessionId": 1, characterId: 1 },
        name: "credit_transactions_sessionReward_unique",
        unique: true,
        partialFilterExpression: { "metadata.autoReward": true },
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
      {
        // 편의점 카탈로그 시드/lookup 안정 키. 기존 row 는 slug 누락 가능 → sparse.
        key: { slug: 1 },
        name: "master_items_slug_unique",
        unique: true,
        sparse: true,
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

    /* ── credit_pools (tia_bot 통합) ── */
    db.collection("credit_pools").createIndex(
      { poolId: 1 },
      { name: "credit_pools_poolId_unique", unique: true },
    ),

    /* ── shop_inventory (tia_bot 통합) ── */
    db.collection("shop_inventory").createIndex(
      { userId: 1, itemId: 1 },
      { name: "shop_inventory_userId_itemId_unique", unique: true },
    ),

    /* ── shop_daily_stock (tia_bot 통합) ── */
    db.collection("shop_daily_stock").createIndex(
      { itemId: 1 },
      { name: "shop_daily_stock_itemId_unique", unique: true },
    ),

    /* ── stock_prices (tia_bot 통합) ── */
    db.collection("stock_prices").createIndex(
      { ticker: 1 },
      { name: "stock_prices_ticker_unique", unique: true },
    ),

    /* ── stock_holdings (tia_bot 통합 → ERP M3 character 단위 전환) ──
     *
     * Phase 2 ledger 가 character 단위로 전환되면서 holdings 도 characterId 키.
     *
     * 운영 DB 호환:
     * - tia_bot 적재 row 들은 `userId` 만 있고 `characterId` 필드 부재.
     *   `{ characterId: 1, ticker: 1 } unique` 를 풀 인덱스로 걸면 같은
     *   (`characterId=null`, `ticker=X`) 쌍이 다수 → E11000.
     * - `users.discordId` 의 partial unique 패턴(`{ $type: "string" }`)을 모방하여
     *   characterId 가 string 인 row(=신규 ERP 적재) 에만 unique 강제.
     *   legacy userId-only row 는 본 인덱스 적용 외 → 매수 차단 회피.
     *
     * 또한 기존 운영 DB 에 `stock_holdings_userId_ticker_unique` 가 잔존하면
     * `userId: null` 충돌(unique 위반)로 신규 매수가 막힘 → 본 호출 직전 best-effort drop.
     * dropIndex 자체가 ensureAllIndexes() 의 idempotent 성질을 깨지 않도록
     * try/catch (인덱스 부재는 무시) — 재실행 안전.
     */
    (async () => {
      const stockHoldingsCol = db.collection("stock_holdings");
      // 신규 키 인덱스를 먼저 시도 — 이미 있으면 createIndexes 가 멱등.
      await stockHoldingsCol.createIndexes([
        {
          key: { characterId: 1, ticker: 1 },
          name: "stock_holdings_characterId_ticker_unique",
          unique: true,
          // legacy userId-only row(characterId 부재/null) 는 unique 적용 외.
          // 신규 ERP 적재(characterId: string) 에만 (characterId, ticker) 유일성 강제.
          partialFilterExpression: { characterId: { $type: "string" } },
        },
        {
          key: { ticker: 1 },
          name: "stock_holdings_ticker",
        },
      ]);
      // legacy userId 키 인덱스 best-effort 제거 (없으면 throw — 무시).
      try {
        await stockHoldingsCol.dropIndex("stock_holdings_userId_ticker_unique");
      } catch {
        // index not found — 신규 환경 또는 이미 마이그된 환경. 무시.
      }
    })(),

    /* ── stock_price_history (M1: 30일 가격 시계열) ──
     * TTL 30일. ticker 별 차트 조회는 (ticker, createdAt desc) 복합 인덱스로 최적화.
     */
    db.collection("stock_price_history").createIndexes([
      {
        key: { createdAt: 1 },
        name: "stock_price_history_ttl",
        // 30 일 = 30 * 24 * 60 * 60.
        expireAfterSeconds: 30 * 24 * 60 * 60,
      },
      {
        key: { ticker: 1, createdAt: -1 },
        name: "stock_price_history_ticker_createdAt",
      },
    ]),

    /* ── trpg_sessions (trpg-bot 신규 모델) ── */
    db.collection("trpg_sessions").createIndexes([
      {
        // 길드 + 날짜 기반 월별 조회 / 같은 날 충돌 검사.
        key: { guildId: 1, date: 1 },
        name: "trpg_sessions_guildId_date",
      },
      {
        // 길드 + 상태 + 날짜 — open 세션만 캘린더에 노출.
        key: { guildId: 1, status: 1, date: 1 },
        name: "trpg_sessions_guildId_status_date",
      },
      {
        // 생성 알림 스케줄러: 미발송 + lease 만료된 후보 스캔.
        key: {
          status: 1,
          notificationSentAt: 1,
          notificationClaimLeaseUntil: 1,
        },
        name: "trpg_sessions_notification_pending",
      },
      {
        // 24h 리마인드 스케줄러: 미발송 + 시작 시각 윈도우 스캔.
        key: { status: 1, reminderSentAt: 1, date: 1, startTime: 1 },
        name: "trpg_sessions_reminder_pending",
      },
      {
        // 취소 알림 스케줄러: 취소 대기열 + 미발송 + lease 만료 후보 스캔.
        key: {
          status: 1,
          cancellationNotificationQueuedAt: 1,
          cancellationNotificationSentAt: 1,
          cancellationNotificationClaimLeaseUntil: 1,
        },
        name: "trpg_sessions_cancellation_notification_pending",
      },
      {
        // 수정 알림 스케줄러: 수정 대기열 + 미발송 + lease 만료 후보 스캔.
        key: {
          status: 1,
          updateNotificationQueuedAt: 1,
          updateNotificationSentAt: 1,
          updateNotificationClaimLeaseUntil: 1,
        },
        name: "trpg_sessions_update_notification_pending",
      },
    ]),

    /* ── trpg_guild_members (참가자 후보 풀) ── */
    db.collection("trpg_guild_members").createIndexes([
      {
        key: { guildId: 1, discordUserId: 1 },
        name: "trpg_guild_members_guildId_discordUserId_unique",
        unique: true,
      },
      {
        // 활성 멤버만 (leftAt: null) 필터링용.
        key: { guildId: 1, leftAt: 1 },
        name: "trpg_guild_members_guildId_leftAt",
      },
    ]),

    /* ── trpg_session_notifications (발송 시도 로그) ── */
    db.collection("trpg_session_notifications").createIndex(
      { sessionId: 1, kind: 1, discordUserId: 1 },
      { name: "trpg_session_notifications_sessionId_kind_userId" },
    ),
  ]);
}
