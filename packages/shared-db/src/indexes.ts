import type { Db, IndexDescription } from "mongodb";

import { getDb } from "./client.js";
import { ensureChangeLogsIndexes } from "./migrations/ensure-change-logs-indexes.js";

/**
 * Lore auxiliary collections are rebuildable projections over the domain SSOT.
 * Keep their exact index contract exported so the narrow preflight/migration
 * CLI and the broad `ensureAllIndexes()` path cannot drift apart.
 */
export const LORE_INDEX_DEFINITIONS: Record<string, IndexDescription[]> = {
  lore_sources: [
    {
      key: { sourceId: 1 },
      name: "lore_sources_sourceId_unique",
      unique: true,
    },
    {
      key: { kind: 1, capturedAt: -1 },
      name: "lore_sources_kind_capturedAt",
    },
    {
      key: { sessionId: 1 },
      name: "lore_sources_sessionId",
      partialFilterExpression: { sessionId: { $type: "string" } },
    },
    {
      key: { ingestionRunId: 1 },
      name: "lore_sources_ingestionRunId",
      partialFilterExpression: { ingestionRunId: { $type: "string" } },
    },
  ],
  lore_aliases: [
    {
      key: { aliasId: 1 },
      name: "lore_aliases_aliasId_unique",
      unique: true,
    },
    {
      key: { logicalKey: 1 },
      name: "lore_aliases_active_logicalKey_unique",
      unique: true,
      partialFilterExpression: { "lineage.state": "active" },
    },
    {
      key: { normalizedAlias: 1, "lineage.state": 1, confidence: -1 },
      name: "lore_aliases_normalized_state_confidence",
    },
    {
      key: { entityRef: 1, "lineage.state": 1 },
      name: "lore_aliases_entityRef_state",
    },
    {
      key: { "evidence.sourceId": 1 },
      name: "lore_aliases_evidence_sourceId",
    },
  ],
  lore_edges: [
    {
      key: { edgeId: 1 },
      name: "lore_edges_edgeId_unique",
      unique: true,
    },
    {
      key: { logicalKey: 1 },
      name: "lore_edges_active_logicalKey_unique",
      unique: true,
      partialFilterExpression: { "lineage.state": "active" },
    },
    {
      key: { fromRef: 1, relation: 1, "lineage.state": 1 },
      name: "lore_edges_from_relation_state",
    },
    {
      key: { toRef: 1, relation: 1, "lineage.state": 1 },
      name: "lore_edges_to_relation_state",
    },
    {
      key: { "evidence.sourceId": 1 },
      name: "lore_edges_evidence_sourceId",
    },
  ],
  lore_claims: [
    {
      key: { claimId: 1 },
      name: "lore_claims_claimId_unique",
      unique: true,
    },
    {
      key: { logicalKey: 1 },
      name: "lore_claims_active_logicalKey_unique",
      unique: true,
      partialFilterExpression: { "lineage.state": "active" },
    },
    {
      key: { subjectRef: 1, predicate: 1, "lineage.state": 1 },
      name: "lore_claims_subject_predicate_state",
    },
    {
      key: { status: 1, "lineage.state": 1, updatedAt: -1 },
      name: "lore_claims_status_state_updatedAt",
    },
    {
      key: { "evidence.sourceId": 1 },
      name: "lore_claims_evidence_sourceId",
    },
  ],
  lore_search_documents: [
    {
      key: { entityRef: 1 },
      name: "lore_search_documents_entityRef_unique",
      unique: true,
    },
    {
      key: {
        title: "text",
        aliases: "text",
        summary: "text",
        searchText: "text",
      },
      name: "lore_search_documents_text",
      weights: { title: 10, aliases: 8, summary: 5, searchText: 1 },
      default_language: "none",
      textIndexVersion: 3,
    },
    {
      key: {
        "access.visibility": 1,
        projectionOwner: 1,
        entityKind: 1,
        status: 1,
        updatedAt: -1,
      },
      name: "lore_search_documents_access_owner_kind_status_updatedAt",
    },
    {
      key: { "facets.categories": 1 },
      name: "lore_search_documents_facets_categories",
    },
    {
      key: { "facets.tags": 1 },
      name: "lore_search_documents_facets_tags",
    },
    {
      key: { "facets.sessionIds": 1 },
      name: "lore_search_documents_facets_sessionIds",
    },
    {
      key: { "facets.factionCodes": 1 },
      name: "lore_search_documents_facets_factionCodes",
    },
    {
      key: { "facets.institutionCodes": 1 },
      name: "lore_search_documents_facets_institutionCodes",
    },
  ],
  lore_ingestion_runs: [
    {
      key: { runId: 1 },
      name: "lore_ingestion_runs_runId_unique",
      unique: true,
    },
    {
      key: { status: 1, startedAt: -1, createdAt: -1 },
      name: "lore_ingestion_runs_status_startedAt",
    },
    {
      key: { mode: 1, startedAt: -1, createdAt: -1 },
      name: "lore_ingestion_runs_mode_startedAt",
    },
    {
      key: { sourceIds: 1 },
      name: "lore_ingestion_runs_sourceIds",
    },
    {
      key: { status: 1, leaseExpiresAt: 1 },
      name: "lore_ingestion_runs_status_leaseExpiresAt",
    },
    {
      key: { mode: 1, status: 1 },
      name: "lore_ingestion_runs_mode_running_unique",
      unique: true,
      partialFilterExpression: { status: "running" },
    },
  ],
};

/** 보고서 identity와 명시적 graph backlink/inbound 조회 계약. */
export const SESSION_REPORT_INDEX_DEFINITIONS: IndexDescription[] = [
  {
    key: { sessionId: 1 },
    name: "session_reports_sessionId",
  },
  {
    key: { sessionId: 1 },
    name: "session_reports_sessionId_unique",
    unique: true,
  },
  {
    key: { relatedWikiSlugs: 1 },
    name: "session_reports_relatedWikiSlugs",
  },
  {
    key: { relatedPersonnelCodenames: 1 },
    name: "session_reports_relatedPersonnelCodenames",
  },
  {
    key: { relatedCatalogSlugs: 1 },
    name: "session_reports_relatedCatalogSlugs",
  },
];

export interface IndexEnsureOptions {
  onEnsured?: (index: { collection: string; name: string }) => void;
}

export const BUREAUCRAT_VOTE_INDEX_DEFINITIONS: IndexDescription[] = [
  {
    key: { requestKey: 1 },
    name: "bureaucrat_votes_requestKey_unique",
    unique: true,
  },
  {
    key: { activePresetKey: 1 },
    name: "bureaucrat_votes_activePresetKey_unique",
    unique: true,
    partialFilterExpression: {
      schemaVersion: 1,
      status: "OPEN",
      activePresetKey: { $type: "string" },
    },
  },
  {
    key: { status: 1, closesAt: 1 },
    name: "bureaucrat_votes_status_closesAt",
  },
  {
    key: {
      status: 1,
      "publication.state": 1,
      "publication.leaseUntil": 1,
      createdAt: 1,
    },
    name: "bureaucrat_votes_publication_queue",
  },
];

export const RESEARCH_LAB_INDEX_DEFINITIONS: Record<
  string,
  IndexDescription[]
> = {
  research_lab_jobs: [
    {
      key: { requestId: 1 },
      name: "research_lab_jobs_requestId_unique",
      unique: true,
    },
    {
      key: { outstandingKey: 1 },
      name: "research_lab_jobs_outstandingKey_unique",
      unique: true,
      partialFilterExpression: { outstandingKey: { $type: "string" } },
    },
    {
      key: { activeLineKey: 1 },
      name: "research_lab_jobs_activeLineKey_unique",
      unique: true,
      partialFilterExpression: { activeLineKey: { $type: "string" } },
    },
    {
      key: { recipeId: 1, status: 1, queuedAt: 1, _id: 1 },
      name: "research_lab_jobs_recipe_fifo",
    },
    {
      key: { status: 1, completesAt: 1, claimDeadline: 1, leaseUntil: 1 },
      name: "research_lab_jobs_due_lease",
    },
    {
      key: { pendingSignals: 1, signalLeaseUntil: 1, updatedAt: 1 },
      name: "research_lab_jobs_signal_due",
    },
    {
      key: {
        status: 1,
        claimReminderAt: 1,
        claimReminderSentAt: 1,
        reminderLeaseUntil: 1,
      },
      name: "research_lab_jobs_reminder_due",
    },
    {
      key: { requesterUserId: 1, createdAt: -1 },
      name: "research_lab_jobs_requester_createdAt",
    },
  ],
  npc_relationships: [
    {
      key: { npcId: 1, userId: 1, characterId: 1 },
      name: "npc_relationships_npc_user_character_unique",
      unique: true,
    },
  ],
  npc_relationship_events: [
    {
      key: { dedupeKey: 1 },
      name: "npc_relationship_events_dedupeKey_unique",
      unique: true,
    },
    {
      key: { npcId: 1, userId: 1, characterId: 1, sceneId: 1 },
      name: "npc_relationship_events_user_scene_unique",
      unique: true,
      partialFilterExpression: { sceneId: { $type: "string" } },
    },
    {
      key: { npcId: 1, userId: 1, characterId: 1, createdAt: 1, _id: 1 },
      name: "npc_relationship_events_npc_user_character_createdAt",
    },
  ],
  npc_conversations: [
    {
      key: { npcId: 1, userId: 1, characterId: 1 },
      name: "npc_conversations_npc_user_character_unique",
      unique: true,
    },
  ],
};

export async function ensureResearchLabIndexes(
  database?: Db,
  options: IndexEnsureOptions = {},
): Promise<void> {
  const db = database ?? (await getDb());
  for (const [collection, indexes] of Object.entries(
    RESEARCH_LAB_INDEX_DEFINITIONS,
  )) {
    for (const index of indexes) {
      const { key, ...indexOptions } = index;
      const name = await db.collection(collection).createIndex(key, indexOptions);
      options.onEnsured?.({ collection, name });
    }
  }
}

export async function ensureBureaucratVoteIndexes(
  database?: Db,
  options: IndexEnsureOptions = {},
): Promise<void> {
  const db = database ?? (await getDb());
  for (const index of BUREAUCRAT_VOTE_INDEX_DEFINITIONS) {
    const { key, ...indexOptions } = index;
    const name = await db.collection("bureaucrat_votes").createIndex(
      key,
      indexOptions,
    );
    options.onEnsured?.({ collection: "bureaucrat_votes", name });
  }
}

/** 단일 unique index의 현재 데이터 중복 여부를 검사한다. */
export async function hasLoreUniqueIndexConflict(
  db: Db,
  collectionName: string,
  index: IndexDescription,
): Promise<boolean> {
  if (index.unique !== true) return false;
  const exists = await db
    .listCollections({ name: collectionName }, { nameOnly: true })
    .hasNext();
  if (!exists) return false;

  const key = index.key instanceof Map
    ? Object.fromEntries(index.key)
    : index.key;
  const fields = Object.keys(key);
  if (fields.length === 0) return false;
  const groupId = Object.fromEntries(
    fields.map((field, indexPosition) => [
      `key${indexPosition}`,
      `$${field}`,
    ]),
  );
  const pipeline: Record<string, unknown>[] = [];
  if (index.partialFilterExpression) {
    pipeline.push({ $match: index.partialFilterExpression });
  }
  // logicalKey가 없는 legacy projection은 storage migration에서 계산형
  // identity로 backfill한다. 누락 행 전체를 null 중복으로 오판하지 않는다.
  if (fields.length === 1 && fields[0] === "logicalKey") {
    pipeline.push({ $match: { logicalKey: { $type: "string" } } });
  }
  pipeline.push(
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  );
  return db.collection(collectionName).aggregate(pipeline).hasNext();
}

/** 모든 lore unique 계약의 현재 중복 blocker를 진단한다. */
export async function findLoreUniqueIndexConflicts(db: Db): Promise<string[]> {
  const conflicts: string[] = [];
  for (const [collectionName, indexes] of Object.entries(
    LORE_INDEX_DEFINITIONS,
  )) {
    for (const index of indexes) {
      if (
        index.unique === true &&
        (await hasLoreUniqueIndexConflict(db, collectionName, index))
      ) {
        conflicts.push(`${collectionName}.${String(index.name)}`);
      }
    }
  }
  return conflicts;
}

async function assertLoreIndexMigrationReady(db: Db): Promise<void> {
  const uniqueConflicts = await findLoreUniqueIndexConflicts(db);
  if (uniqueConflicts.length > 0) {
    throw new Error(
      `[lore-indexes] unique index 중복 키를 먼저 정리해야 합니다: ${uniqueConflicts.join(", ")}`,
    );
  }
  const configs = [
    {
      collection: "lore_aliases",
      expression: { $concat: ["$entityRef", "|", "$aliasType", "|", "$normalizedAlias"] },
    },
    {
      collection: "lore_edges",
      expression: { $concat: ["$fromRef", "|", "$relation", "|", "$toRef"] },
    },
    {
      collection: "lore_claims",
      expression: { $concat: ["$subjectRef", "|", "$predicate"] },
    },
  ] as const;
  for (const config of configs) {
    const exists = await db
      .listCollections({ name: config.collection }, { nameOnly: true })
      .hasNext();
    if (!exists) continue;
    const collection = db.collection(config.collection);
    const invalid = await collection.countDocuments({
      $or: [
        { logicalKey: { $not: { $type: "string" } } },
        { $expr: { $ne: ["$logicalKey", config.expression] } },
      ],
    });
    const duplicate = await collection
      .aggregate([
        { $match: { "lineage.state": "active" } },
        { $group: { _id: config.expression, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
      ])
      .hasNext();
    if (invalid > 0 || duplicate) {
      throw new Error(
        `[lore-indexes] ${config.collection} logical identity migration이 필요합니다. 먼저 lore:storage를 실행하세요.`,
      );
    }
  }
  const searchExists = await db
    .listCollections({ name: "lore_search_documents" }, { nameOnly: true })
    .hasNext();
  if (
    searchExists &&
    (await db.collection("lore_search_documents").countDocuments({
      projectionOwner: { $not: { $type: "string" } },
    })) > 0
  ) {
    throw new Error(
      "[lore-indexes] search projection owner migration이 필요합니다. 먼저 lore:storage를 실행하세요.",
    );
  }
}

export async function ensureLoreIndexes(
  database?: Db,
  options: IndexEnsureOptions = {},
): Promise<void> {
  const db = database ?? (await getDb());
  await assertLoreIndexMigrationReady(db);
  // MongoDB index DDL은 collection 간 원자적이지 않다. 각 index를 순차·멱등
  // 적용하고 unique DDL 직전에 다시 검사해 preflight 이후 데이터 race를 닫는다.
  // 중간 실패 뒤에도 이미 생성된 동일 spec은 createIndex가 재사용하므로 재실행 가능하다.
  for (const [collection, indexes] of Object.entries(LORE_INDEX_DEFINITIONS)) {
    for (const index of indexes) {
      if (
        index.unique === true &&
        (await hasLoreUniqueIndexConflict(db, collection, index))
      ) {
        throw new Error(
          `[lore-indexes] unique index 중복 키를 먼저 정리해야 합니다: ${collection}.${String(index.name)}`,
        );
      }
      const { key, ...indexOptions } = index;
      const name = await db.collection(collection).createIndex(key, indexOptions);
      options.onEnsured?.({ collection, name });
    }
  }
}

export async function ensureSessionReportIndexes(
  database?: Db,
  options: IndexEnsureOptions = {},
): Promise<void> {
  const db = database ?? (await getDb());
  for (const index of SESSION_REPORT_INDEX_DEFINITIONS) {
    if (
      index.unique === true &&
      (await hasLoreUniqueIndexConflict(db, "session_reports", index))
    ) {
      throw new Error(
        `[session-report-indexes] unique index 중복 키를 먼저 정리해야 합니다: session_reports.${String(index.name)}`,
      );
    }
    const { key, ...indexOptions } = index;
    const name = await db
      .collection("session_reports")
      .createIndex(key, indexOptions);
    options.onEnsured?.({ collection: "session_reports", name });
  }
}

/**
 * 모든 컬렉션의 인덱스를 생성한다.
 * long-running 모드에서는 connect() 후 직접 호출,
 * serverless 모드에서는 필요 시 빌드 스크립트 등에서 1회 실행.
 */
export async function ensureAllIndexes(): Promise<void> {
  const db = await getDb();

  await Promise.all([
    ensureLoreIndexes(db),
    ensureSessionReportIndexes(db),
    ensureBureaucratVoteIndexes(db),
    ensureResearchLabIndexes(db),

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
      {
        key: { requestId: 1 },
        name: "credit_transactions_requestId_partial_unique",
        unique: true,
        partialFilterExpression: { requestId: { $type: "string" } },
      },
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
      // 재무기구 일일 수당 멱등 검출 — KST date + characterId 당 1회.
      {
        key: { "metadata.dailyAllowanceDate": 1, characterId: 1 },
        name: "credit_transactions_dailyAllowance_unique",
        unique: true,
        partialFilterExpression: { "metadata.dailyAllowance": true },
      },
    ]),

    /* ── credit_balances (현재 잔액 SSOT) ── */
    db.collection("credit_balances").createIndex(
      { characterId: 1 },
      { name: "credit_balances_characterId_unique", unique: true },
    ),

    /* ── equipment research (경제 mutation 멱등성/중복 시작 방지) ── */
    db.collection("research_projects").createIndexes([
      {
        key: { identityKey: 1 },
        name: "research_projects_identityKey_partial_unique",
        unique: true,
        partialFilterExpression: { identityKey: { $type: "string" } },
      },
      {
        key: { requestId: 1 },
        name: "research_projects_requestId_partial_unique",
        unique: true,
        partialFilterExpression: { requestId: { $type: "string" } },
      },
    ]),
    db.collection("research_contributions").createIndex(
      { requestId: 1 },
      {
        name: "research_contributions_requestId_partial_unique",
        unique: true,
        partialFilterExpression: { requestId: { $type: "string" } },
      },
    ),
    db.collection("research_team_funding_pools").createIndex(
      { key: 1 },
      {
        name: "research_team_funding_pools_key_funding_unique",
        unique: true,
        partialFilterExpression: { status: "funding" },
      },
    ),
    db.collection("economic_operations").createIndex(
      { status: 1, updatedAt: 1 },
      { name: "economic_operations_status_updatedAt" },
    ),
    /* ── MrBeast soda purchase history (apology payback read path) ── */
    db.collection("shop_daily_purchase_counters").createIndex(
      { userId: 1, slug: 1, kstDate: 1 },
      { name: "shop_daily_purchase_counters_userId_slug_kstDate" },
    ),
    /* ── MrBeast soda lottery (activation prerequisite; not auto-run) ── */
    db.collection("mrbeast_lottery_claims").createIndexes([
      {
        key: { characterId: 1 },
        name: "mrbeast_lottery_claims_pending_character_global_unique",
        unique: true,
        partialFilterExpression: { status: "PENDING" },
      },
      {
        key: {
          status: 1,
          tier: 1,
          characterIsPublic: 1,
          revealedAt: -1,
          _id: -1,
        },
        name: "mrbeast_lottery_claims_winners_recent",
      },
    ]),
    db.collection("mrbeast_lottery_entitlements").createIndexes([
      {
        key: { eventId: 1, sourceRequestId: 1, ordinal: 1 },
        name: "mrbeast_lottery_entitlements_source_ordinal_unique",
        unique: true,
      },
      {
        key: { characterId: 1, status: 1, grantedAt: 1, _id: 1 },
        name: "mrbeast_lottery_entitlements_character_available_fifo",
      },
      {
        key: { claimId: 1 },
        name: "mrbeast_lottery_entitlements_claim_unique",
        unique: true,
        partialFilterExpression: { claimId: { $type: "string" } },
      },
    ]),
    db.collection("equipment_workshop_requests").createIndexes([
      {
        key: { userId: 1, createdAt: -1 },
        name: "equipment_workshop_requests_userId_createdAt",
      },
      {
        key: { status: 1, createdAt: -1 },
        name: "equipment_workshop_requests_status_createdAt",
      },
      {
        key: {
          "discordDmOutbox.availableAt": 1,
          updatedAt: 1,
        },
        name: "equipment_workshop_requests_discord_dm_outbox",
      },
      {
        key: { inventoryEntryId: 1 },
        name: "equipment_workshop_requests_inventoryEntry_in_progress_unique",
        unique: true,
        partialFilterExpression: {
          status: "IN_PROGRESS",
          inventoryEntryId: { $type: "string" },
        },
      },
      {
        key: { activeOperationKey: 1 },
        name: "equipment_workshop_requests_active_operation_unique",
        unique: true,
        partialFilterExpression: {
          activeOperationKey: { $type: "string" },
        },
      },
    ]),
    db.collection("equipment_workshop_blueprints").createIndexes([
      {
        key: { slug: 1 },
        name: "equipment_workshop_blueprints_slug_unique",
        unique: true,
      },
      {
        key: { status: 1, updatedAt: -1 },
        name: "equipment_workshop_blueprints_status_updatedAt",
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
    db.collection("character_inventory").createIndexes([
      {
        key: { characterId: 1, itemId: 1 },
        name: "character_inventory_characterId_itemId",
      },
      {
        key: { characterId: 1, equippedSlot: 1 },
        name: "character_inventory_equipped_slot_unique",
        unique: true,
        partialFilterExpression: { equippedSlot: { $type: "string" } },
      },
    ]),

    /* ── shared_inventory (party/common reward storage) ── */
    db.collection("shared_inventory").createIndex(
      { scope: 1, itemId: 1 },
      { name: "shared_inventory_scope_itemId_unique", unique: true },
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

    /* ── notifications (from task spec) ── */
    db.collection("notifications").createIndexes([
      {
        key: { userId: 1, isRead: 1, createdAt: -1 },
        name: "notifications_userId_isRead_createdAt",
      },
      {
        key: { dedupeKey: 1 },
        name: "notifications_dedupeKey_partial_unique",
        unique: true,
        partialFilterExpression: { dedupeKey: { $type: "string" } },
      },
    ]),

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
      {
        key: {
          finalizationPending: 1,
          status: 1,
          finalizationClaimLeaseUntil: 1,
          finalizationRequestedAt: 1,
        },
        name: "sessions_finalization_pending_claimLease",
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

    /* ── faction_relation_logs / faction_quest_progress / faction_favorability
     * (StarGateV2 세력 접선 활동) ──
     *
     * activity 라우트가 요청마다 code 단위로 조회 — code 기반 인덱스 보장.
     * 유일성은 라우트의 upsert 키({code} / {code, questId})가 보장하므로
     * 기존 데이터 호환을 위해 unique 제약은 걸지 않는다.
     */
    db.collection("faction_relation_logs").createIndex(
      { code: 1, createdAt: -1 },
      { name: "faction_relation_logs_code_createdAt" },
    ),
    db.collection("faction_quest_progress").createIndex(
      { code: 1, questId: 1 },
      { name: "faction_quest_progress_code_questId" },
    ),
    db.collection("faction_favorability").createIndex(
      { code: 1 },
      { name: "faction_favorability_code" },
    ),

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

    /* ── shop_reorder_requests (편의점 재입고 요청) ──
     *
     * StarGateV2 lib/shop/reorder-requests.ts 조회 패턴:
     * - pending 목록/카운트: {kind, status} + sort {createdAt: 1}
     * - 사용자·품목 일일 dedupe/한도: {kind, date, userId, slug} (+status)
     * - fulfill 류는 {_id $in} 주도라 _id 기본 인덱스로 충분.
     *
     * stock_discord_market_wires 는 `_id: "scheduled"` 싱글턴 조회만,
     * shop_stock_audit_logs 는 insert-only — 둘 다 보조 인덱스 불필요.
     */
    db.collection("shop_reorder_requests").createIndexes([
      {
        key: { kind: 1, status: 1, createdAt: 1 },
        name: "shop_reorder_requests_kind_status_createdAt",
      },
      {
        key: { kind: 1, date: 1, userId: 1, slug: 1, status: 1 },
        name: "shop_reorder_requests_user_item_daily",
      },
    ]),

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

    /* ── stock_scheduled_events (GM 일회성 공시 예약·최근 이력) ── */
    db.collection("stock_scheduled_events").createIndex(
      { status: 1, executeAt: 1, ticker: 1 },
      { name: "stock_scheduled_events_status_executeAt_ticker" },
    ),

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
      {
        key: { operationKey: 1 },
        name: "stock_price_history_operationKey_partial_unique",
        unique: true,
        partialFilterExpression: { operationKey: { $type: "string" } },
      },
    ]),

    /* ── player_trades (플레이어 간 통합 자산 거래) ── */
    db.collection("player_trades").createIndexes([
      {
        key: { "initiator.userId": 1, updatedAt: -1 },
        name: "player_trades_initiator_updatedAt",
      },
      {
        key: { "counterparty.userId": 1, updatedAt: -1 },
        name: "player_trades_counterparty_updatedAt",
      },
      {
        key: { status: 1, updatedAt: -1 },
        name: "player_trades_status_updatedAt",
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

    /* ── long-running worker durable coordination ── */
    db.collection("scheduled_job_runs").createIndexes([
      {
        key: { jobName: 1, slotKey: 1 },
        name: "scheduled_job_runs_jobName_slotKey_unique",
        unique: true,
      },
      {
        key: { status: 1, availableAt: 1, leaseUntil: 1 },
        name: "scheduled_job_runs_status_availableAt_leaseUntil",
      },
    ]),
    db.collection("integration_outbox").createIndexes([
      {
        key: { dedupeKey: 1 },
        name: "integration_outbox_dedupeKey_unique",
        unique: true,
      },
      {
        key: { status: 1, availableAt: 1, createdAt: 1, _id: 1 },
        name: "integration_outbox_status_availableAt_createdAt",
      },
      {
        key: {
          kind: 1,
          status: 1,
          availableAt: 1,
          createdAt: 1,
          _id: 1,
        },
        name: "integration_outbox_kind_status_availableAt_createdAt",
      },
      {
        key: { status: 1, leaseUntil: 1, createdAt: 1, _id: 1 },
        name: "integration_outbox_status_leaseUntil_createdAt",
      },
      {
        key: {
          kind: 1,
          status: 1,
          leaseUntil: 1,
          createdAt: 1,
          _id: 1,
        },
        name: "integration_outbox_kind_status_leaseUntil_createdAt",
      },
      {
        key: { status: 1, kind: 1, deliveredAt: -1 },
        name: "integration_outbox_status_kind_deliveredAt",
      },
      {
        key: {
          partitionKey: 1,
          status: 1,
          partitionOrderAt: 1,
          createdAt: 1,
          _id: 1,
        },
        name: "integration_outbox_partition_status_order",
      },
    ]),
    db.collection("worker_checkpoints").createIndex(
      { name: 1 },
      { name: "worker_checkpoints_name_unique", unique: true },
    ),

    /* ── desired-state consumer due scans ── */
    db.collection("research_discord_cards").createIndex(
      { nextAttemptAt: 1, leaseExpiresAt: 1, updatedAt: 1 },
      { name: "research_discord_cards_due" },
    ),
  ]);
}
