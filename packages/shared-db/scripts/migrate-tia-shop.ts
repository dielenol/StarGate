/**
 * Phase 1D — tia_bot SQLite (shop.db) → MongoDB(stargate) 1회성 마이그레이션 스크립트.
 *
 * 사용:
 *   pnpm --filter @stargate/shared-db tsx scripts/migrate-tia-shop.ts \
 *     --sqlite=<path> [--dry-run | --execute --yes] [--verify-only] \
 *     [--migration-tag=<string>] [--mongodb-uri=<uri>]
 *
 * 기본 동작 = dry-run (안전). --execute --yes 가 함께 있어야 실제 write.
 *
 * 멱등성:
 *   - migration_tag 단위로 1회만 실행 (재실행 사전 차단).
 *   - credit_pools / stock_prices / stock_holdings / shop_inventory / shop_daily_stock 은 idempotent upsert.
 *   - credit_transactions 는 tag 기반 사전 검사로 중복 ledger 방지.
 *
 * 부분 마이그 후 에러 발생 시 복구:
 *   1. 권장: pre-migration mongo 백업으로 mongorestore 복원.
 *   2. 수동 정리:
 *      - db.credit_transactions.deleteMany({"description": {$regex: "^TIA_BOT_MIGRATION_<tag>"}})
 *      - db.stock_holdings, db.stock_prices, db.shop_inventory, db.shop_daily_stock 의
 *        해당 마이그 시작 시각 이후 documents 정리.
 *   3. 차선: 다른 --migration-tag 로 재시도 (이전 tag ledger 는 영구 잔존).
 *
 * Phase 1D 산출물. 실제 운영 컷오버는 Phase 1F.
 */

// 1. 코어 라이브러리, 기타 라이브러리
import process from "node:process";
import Database from "better-sqlite3";

// 3. shared-db 자체 모듈
import {
  addCreditPoolBalance,
  connect,
  close,
  createCreditTransaction,
  ensureAllIndexes,
  ensureCreditPool,
  getCreditPool,
  getDb,
  OPERATION_POOL_ID,
  upsertDiscordUser,
} from "../src/index.js";

import {
  creditTransactionsCol,
  shopDailyStockCol,
  shopInventoryCol,
  stockHoldingsCol,
  stockPricesCol,
} from "../src/collections.js";

// 7. 상수
const DEFAULT_DB_NAME = "stargate";
const MIGRATION_LEDGER_KIND = "migration";
const MIGRATION_LEGACY_SOURCE = "shop.db";
const MIGRATION_DESC_PREFIX = "TIA_BOT_MIGRATION_";

// sentinel ObjectId hex (24-char). 마이그레이션이 생성한 시스템 ledger 라는 것을 표시.
// 향후 admin UI 가 이 값을 인지하면 "(SYSTEM_MIGRATION)" 으로 렌더링 가능.
const MIGRATION_SYSTEM_USER_ID = "000000000000000000000001";

// 8. Interface / Type
interface CliArgs {
  sqlite: string;
  dryRun: boolean;
  execute: boolean;
  yes: boolean;
  verifyOnly: boolean;
  migrationTag: string;
  mongodbUri?: string;
}

interface SqliteCreditRow {
  user_id: number | bigint;
  user_name: string;
  balance: number;
}

interface SqliteOperationPoolRow {
  balance: number;
}

interface SqliteInventoryRow {
  user_id: number | bigint;
  item_id: string;
  quantity: number;
}

interface SqliteDailyStockRow {
  item_id: string;
  stock: number;
  last_refresh: string;
}

interface SqliteStockPriceRow {
  ticker: string;
  price: number;
  prev_price: number;
  event_text: string | null;
  last_update: string;
}

interface SqliteStockHoldingRow {
  user_id: number | bigint;
  ticker: string;
  shares: number;
  avg_price: number;
}

interface UserMapEntry {
  discordId: string;
  userId: string;
  userName: string;
}

type DiscordIdMap = Map<string, UserMapEntry>;

interface MigrationStats {
  users: number;
  ledgerInserts: number;
  ledgerSkipped: number;
  poolBalance: number;
  poolDelta: number;
  stockPrices: number;
  stockHoldings: number;
  shopInventory: number;
  shopDailyStock: number;
}

/* ── CLI ── */

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};
  let dryRunFlag = false;

  for (const a of argv.slice(2)) {
    if (a === "--dry-run") dryRunFlag = true;
    else if (a === "--execute") args.execute = true;
    else if (a === "--yes") args.yes = true;
    else if (a === "--verify-only") args.verifyOnly = true;
    else if (a.startsWith("--sqlite=")) args.sqlite = a.slice("--sqlite=".length);
    else if (a.startsWith("--migration-tag=")) {
      args.migrationTag = a.slice("--migration-tag=".length);
    } else if (a.startsWith("--mongodb-uri=")) {
      args.mongodbUri = a.slice("--mongodb-uri=".length);
    } else if (a === "--help" || a === "-h") {
      printHelpAndExit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelpAndExit(1);
    }
  }

  if (!args.sqlite) {
    console.error("--sqlite=<path> is required.");
    printHelpAndExit(1);
  }

  // 모드 mutually exclusive 검사 — execute / dry-run / verify-only 셋 중 정확히 하나 또는 없음(default dry-run).
  const isExecute = args.execute === true;
  const isVerifyOnly = args.verifyOnly === true;
  const modeFlags = [isExecute, dryRunFlag, isVerifyOnly].filter(Boolean).length;
  if (modeFlags > 1) {
    console.error(
      "Mode flags --execute / --dry-run / --verify-only are mutually exclusive. " +
        "Specify exactly one (default: --dry-run).",
    );
    process.exit(1);
  }

  // 기본값: dry-run (--execute / --verify-only 가 없으면).
  const dryRun = !isExecute && !isVerifyOnly;

  if (isExecute && !args.yes) {
    console.error("--execute requires --yes flag (safety).");
    process.exit(1);
  }

  // migrationTag 형식 검증 — regex/path/정규식 등에 안전한 문자만 허용.
  if (args.migrationTag !== undefined && !/^[A-Za-z0-9._-]+$/.test(args.migrationTag)) {
    console.error(
      "--migration-tag must match [A-Za-z0-9._-]+ (no colons, slashes, or whitespace).",
    );
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const migrationTag = args.migrationTag ?? `${today}`;

  return {
    sqlite: args.sqlite!,
    dryRun,
    execute: isExecute,
    yes: args.yes ?? false,
    verifyOnly: isVerifyOnly,
    migrationTag,
    mongodbUri: args.mongodbUri,
  };
}

function printHelpAndExit(code: number): never {
  console.error(
    `\nUsage:\n  tsx scripts/migrate-tia-shop.ts --sqlite=<path>` +
      ` [--dry-run | --execute --yes] [--verify-only]` +
      ` [--migration-tag=<string>] [--mongodb-uri=<uri>]\n\n` +
      `Defaults to dry-run when --execute is not provided.\n` +
      `--execute requires --yes for safety.\n` +
      `Modes (--execute / --dry-run / --verify-only) are mutually exclusive.\n` +
      `--migration-tag must match [A-Za-z0-9._-]+ (default: today YYYY-MM-DD).\n`,
  );
  process.exit(code);
}

/* ── Header ── */

function printHeader(args: CliArgs, sqliteSizeBytes: number): void {
  const mode = args.verifyOnly
    ? "VERIFY ONLY"
    : args.dryRun
      ? "DRY RUN"
      : "EXECUTE";
  console.log(`=== TIA_BOT MIGRATION ${mode} ===`);
  console.log(`Source: ${args.sqlite} (${formatBytes(sqliteSizeBytes)})`);
  const safeUri = args.mongodbUri
    ? maskMongoUri(args.mongodbUri)
    : maskMongoUri(process.env.MONGODB_URI ?? "(MONGODB_URI not set)");
  console.log(`Target: ${safeUri} (db: ${DEFAULT_DB_NAME})`);
  console.log(`Migration tag: ${MIGRATION_DESC_PREFIX}${args.migrationTag}`);
  console.log("");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function maskMongoUri(uri: string): string {
  // 비밀번호 마스킹: mongodb+srv://user:PASS@host... → mongodb+srv://user:***@host...
  return uri.replace(/(:\/\/[^:]+:)([^@]+)(@)/, "$1***$3");
}

/* ── Main ── */

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // sqlite 미존재 / 권한 부족 시 user-friendly 에러.
  const sqliteFs = await import("node:fs/promises");
  let stat: Awaited<ReturnType<typeof sqliteFs.stat>>;
  try {
    stat = await sqliteFs.stat(args.sqlite);
  } catch {
    console.error(`SQLite file not found or unreadable: ${args.sqlite}`);
    process.exit(1);
  }

  printHeader(args, stat.size);

  // sqlite / mongo lifecycle 을 outer scope 에 두고 finally 에서 정리 (leak 방지).
  let sqlite: Database.Database | null = null;
  let mongoConnected = false;
  let exitCode = 0;
  // catch 단계에서 부분 정리 안내에 쓰는 시작 시각.
  const migrationStartedAt = new Date();

  try {
    sqlite = new Database(args.sqlite, { readonly: true, fileMustExist: true });

    const uri = args.mongodbUri ?? process.env.MONGODB_URI;
    if (!uri) {
      console.error("MONGODB_URI is not set. Provide --mongodb-uri=... or env var.");
      process.exit(1);
    }
    await connect({ uri, dbName: DEFAULT_DB_NAME });
    mongoConnected = true;

    // ensureAllIndexes 는 idempotent — dry-run / verify-only 에서도 안전하게 호출 가능.
    if (args.execute || args.dryRun || args.verifyOnly) {
      await ensureAllIndexes();
    }

    // 사전 차단 검사 — dry-run 에서도 동일 tag 적용 여부를 미리 경고.
    await preflightDuplicateTag(args);

    const userMap = await migrateUsers(sqlite, args);

    // leftover 트랜잭션 검사 — execute 모드에서만 강제, dry-run 에서는 경고만.
    await checkLeftoverCreditTransactions(userMap, args);

    const stats: MigrationStats = {
      users: userMap.size,
      ledgerInserts: 0,
      ledgerSkipped: 0,
      poolBalance: 0,
      poolDelta: 0,
      stockPrices: 0,
      stockHoldings: 0,
      shopInventory: 0,
      shopDailyStock: 0,
    };

    if (!args.verifyOnly) {
      await migrateCredits(sqlite, userMap, args, stats);
      await migrateOperationPool(sqlite, args, stats);
      await migrateStockHoldings(sqlite, userMap, args, stats);
      await migrateStockPrices(sqlite, args, stats);
      await migrateShopInventory(sqlite, userMap, args, stats);
      await migrateShopDailyStock(sqlite, args, stats);
      logTradeLogSkip();
    }

    const verifyOk = await verify(sqlite, userMap, args);
    if (!verifyOk) {
      exitCode = 2;
      console.error("\nVERIFICATION FAILED.");
    }

    printSummary(stats, args, verifyOk);
  } catch (err) {
    console.error("\nMigration error:", err);
    console.error("\n[ROLLBACK GUIDE]");
    console.error(
      `  부분 적용된 mongo 상태가 남아 있다면 같은 tag 로는 재실행 불가. 다음 중 하나를 선택:`,
    );
    console.error(
      `  옵션 A (권장): pre-migration mongo 백업 복원 (mongorestore).`,
    );
    console.error(`  옵션 B (수동 cleanup):`);
    console.error(
      `    db.credit_transactions.deleteMany({"description": {$regex: "^${MIGRATION_DESC_PREFIX}${args.migrationTag}"}})`,
    );
    console.error(
      `    db.stock_holdings.deleteMany({"updatedAt": {$gte: ISODate("${migrationStartedAt.toISOString()}")}})`,
    );
    console.error(
      `    db.shop_inventory.deleteMany({"updatedAt": {$gte: ISODate("${migrationStartedAt.toISOString()}")}})`,
    );
    console.error(`    db.stock_prices, db.shop_daily_stock 도 동일 시각 이후 정리 필요`);
    console.error(
      `  옵션 C: 다른 --migration-tag 로 재시도 (이전 tag ledger 는 영구 잔존).`,
    );
    exitCode = 1;
  } finally {
    if (sqlite) sqlite.close();
    if (mongoConnected) {
      try {
        await close();
      } catch (closeErr) {
        console.error("[WARN] mongo close error:", closeErr);
      }
    }
    if (exitCode !== 0) process.exit(exitCode);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ── Preflight: 같은 tag 의 ledger 가 이미 적용되어 있으면 차단/경고 ── */

async function preflightDuplicateTag(args: CliArgs): Promise<void> {
  const col = await creditTransactionsCol();
  const existing = await col.findOne({
    type: "MIGRATION",
    description: { $regex: `^${escapeRegex(MIGRATION_DESC_PREFIX + args.migrationTag)}` },
  });
  if (!existing) return;

  if (args.execute) {
    throw new Error(
      `Migration tag "${args.migrationTag}" already applied (found existing MIGRATION ledger). ` +
        `Use a different --migration-tag, or restore mongo from backup.`,
    );
  }
  // dry-run / verify-only: 경고만.
  console.warn(
    `[WARN] Migration tag "${args.migrationTag}" already applied. ` +
      `--execute will fail. Use a different tag or restore mongo before cutover.`,
  );
  console.log("");
}

/* ── Preflight: leftover credit_transactions 검사 ── */

async function checkLeftoverCreditTransactions(
  userMap: DiscordIdMap,
  args: CliArgs,
): Promise<void> {
  // userMap 의 userId 가 비어있는 경우(dry-run 신규 유저) 는 검사 스킵.
  const userIds = [...userMap.values()].map((e) => e.userId).filter(Boolean);
  if (userIds.length === 0) return;

  const col = await creditTransactionsCol();
  const concurrentOps = await col.countDocuments({
    userId: { $in: userIds },
  });
  if (concurrentOps === 0) return;

  // tag 의 MIGRATION ledger 만 있는 경우는 정상 (재진입 verify 시).
  const tagOnlyCount = await col.countDocuments({
    userId: { $in: userIds },
    type: "MIGRATION",
    description: { $regex: `^${escapeRegex(MIGRATION_DESC_PREFIX + args.migrationTag)}` },
  });
  const leftover = concurrentOps - tagOnlyCount;
  if (leftover === 0) return;

  const msg =
    `Pre-existing credit_transactions found for migration users (${leftover} non-MIGRATION-tag rows). ` +
    `Stop tia_bot, clean leftover, or use a different --migration-tag before --execute.`;
  if (args.execute) {
    throw new Error(msg);
  }
  console.warn(`[WARN] ${msg}`);
  console.log("");
}

/* ── Step 1: users ── */

async function migrateUsers(
  sqlite: Database.Database,
  args: CliArgs,
): Promise<DiscordIdMap> {
  const rows = sqlite
    .prepare<[], SqliteCreditRow>("SELECT user_id, user_name, balance FROM credits")
    .all();

  console.log(`[1/8] Discord ID mapping: ${rows.length} users`);
  const map: DiscordIdMap = new Map();

  if (args.dryRun) {
    // dry-run: 한 번의 bulk find 로 N+1 회피.
    const db = await getDb();
    const discordIds = rows.map((r) => String(r.user_id));
    const existing = await db
      .collection("users")
      .find({ discordId: { $in: discordIds } })
      .project<{ _id: { toHexString: () => string }; discordId: string }>({
        _id: 1,
        discordId: 1,
      })
      .toArray();
    const existingMap = new Map<string, string>();
    for (const u of existing) {
      existingMap.set(u.discordId, u._id.toHexString());
    }
    for (const row of rows) {
      const discordId = String(row.user_id);
      const userName = row.user_name;
      const hex = existingMap.get(discordId);
      console.log(`  - ${userName} (${discordId}) → ${hex ?? "(NEW)"}`);
      map.set(discordId, {
        discordId,
        userId: hex ?? "",
        userName,
      });
    }
    console.log("");
    return map;
  }

  for (const row of rows) {
    const discordId = String(row.user_id);
    const userName = row.user_name;
    const user = await upsertDiscordUser({
      discordId,
      discordUsername: userName,
      discordGlobalName: null,
      discordAvatar: null,
    });
    const hex = user._id!.toHexString();
    map.set(discordId, { discordId, userId: hex, userName });
    console.log(`  ✓ ${userName} (${discordId}) → ${hex}`);
  }
  console.log("");
  return map;
}

/* ── Step 2: credits → credit_transactions (initial ledger) ── */

async function migrateCredits(
  sqlite: Database.Database,
  userMap: DiscordIdMap,
  args: CliArgs,
  stats: MigrationStats,
): Promise<void> {
  // Phase 2 (character 단위 전환) 이후 호환성 미반영 — Phase D 에서 재작성 예정.
  // createCreditTransaction 시그니처 변경:
  //   user 단위 (userId, userName)  →  character 단위 (characterId, characterCodename, ownerId, ownerName)
  // 각 SQLite credits.user_id → discordId → user._id → findMainCharacterByOwner 매핑 후
  // character 단위 시드가 필요. 본 스크립트는 Phase D 에서 재구성 전까지 호출 금지.
  //
  // tsconfig.json:include=["src"] 라 scripts/ 컴파일 대상 외 → silent 위험.
  // 이 fail-fast guard 가 운영자/Claude 의 잘못된 실행을 즉시 차단.
  // 다른 단계(operation_pool / stock_holdings / stock_prices / shop_inventory / shop_daily_stock)는
  // character 단위 전환 대상이 아니므로 정상 동작 유지.
  throw new Error(
    "migrateCredits: Phase 2 (character 단위 ledger 전환) 후 호환성 미반영 — Phase D 에서 재작성 예정. " +
      "createCreditTransaction 시그니처 변경: userId/userName → characterId/characterCodename/ownerId/ownerName. " +
      "각 SQLite credits.user_id → discordId → user._id → findMainCharacterByOwner 매핑 후 시드 필요. " +
      "스크립트 호출 금지 — Phase D 작업 후 본 throw 를 제거하고 character 단위 시드로 재작성할 것.",
  );

  // 아래 기존 코드는 Phase D 재작성 시 참조용으로 보존 (현재 도달 불가).
  const rows = sqlite
    .prepare<[], SqliteCreditRow>("SELECT user_id, user_name, balance FROM credits")
    .all();

  let total = 0;
  let eligible = 0; // balance >= 0
  let negative = 0;
  for (const r of rows) {
    if (r.balance < 0) {
      negative += 1;
      continue;
    }
    total += r.balance;
    eligible += 1;
  }

  console.log(
    `[2/8] Credits: ${rows.length} users (${eligible} ledger-eligible, ${negative} negative skipped), total ${total} CR`,
  );
  if (negative > 0) {
    for (const r of rows) {
      if (r.balance < 0) {
        console.warn(
          `  [WARN] negative balance skipped: user_id=${String(r.user_id)} balance=${r.balance}`,
        );
      }
    }
  }

  if (args.dryRun) {
    console.log(`  ledger inserts planned: ${eligible}`);
    console.log(`  expected SUM(balance): ${total}`);
    console.log("");
    stats.ledgerInserts = eligible;
    stats.ledgerSkipped = negative;
    return;
  }

  const tag = `${MIGRATION_DESC_PREFIX}${args.migrationTag}`;
  for (const r of rows) {
    if (r.balance < 0) {
      stats.ledgerSkipped += 1;
      continue;
    }
    // balance === 0 도 ledger 시드 (latest balance invariant 보장 — 추후 STOCK_BUY 등 음수 진입 방지).
    const discordId = String(r.user_id);
    const entry = userMap.get(discordId);
    if (!entry) {
      throw new Error(
        `Internal: discordId ${discordId} missing from userMap during credits migration.`,
      );
    }
    await createCreditTransaction({
      userId: entry.userId,
      userName: r.user_name,
      type: "MIGRATION",
      amount: r.balance,
      balance: r.balance,
      description: `${tag}: 초기 ledger from shop.db`,
      metadata: {
        kind: MIGRATION_LEDGER_KIND,
        legacySource: MIGRATION_LEGACY_SOURCE,
        legacyUserId: discordId,
      },
      createdById: MIGRATION_SYSTEM_USER_ID,
      createdByName: "TIA_BOT_MIGRATION",
    });
    stats.ledgerInserts += 1;
  }
  console.log(
    `  ✓ inserted ${stats.ledgerInserts} ledger rows (skipped ${stats.ledgerSkipped} negative)`,
  );
  console.log("");
}

/* ── Step 3: operation_pool → credit_pools ── */

async function migrateOperationPool(
  sqlite: Database.Database,
  args: CliArgs,
  stats: MigrationStats,
): Promise<void> {
  const row = sqlite
    .prepare<[], SqliteOperationPoolRow>("SELECT balance FROM operation_pool WHERE id=1")
    .get();
  const sqliteBalance = row?.balance ?? 0;
  stats.poolBalance = sqliteBalance;

  console.log(`[3/8] Operation pool: ${sqliteBalance} CR (SQLite)`);

  if (args.dryRun) {
    console.log(
      `  ensureCreditPool('${OPERATION_POOL_ID}', '작전 크레딧 풀', 0)` +
        ` + addCreditPoolBalance(${sqliteBalance})`,
    );
    console.log("");
    stats.poolDelta = sqliteBalance;
    return;
  }

  // 멱등 처리: 이미 풀이 있고 balance 가 sqliteBalance 와 동일하면 skip (재실행 안전).
  await ensureCreditPool(OPERATION_POOL_ID, "작전 크레딧 풀", 0);
  const after = await getCreditPool(OPERATION_POOL_ID);
  const currentMongoBalance = after?.balance ?? 0;
  if (currentMongoBalance === sqliteBalance) {
    console.log(
      `  ✓ skipped (reason=balance-match, mongo=${currentMongoBalance}, sqlite=${sqliteBalance})`,
    );
    stats.poolDelta = 0;
  } else {
    const delta = sqliteBalance - currentMongoBalance;
    if (delta !== 0) {
      await addCreditPoolBalance(OPERATION_POOL_ID, delta, { allowNegative: true });
      stats.poolDelta = delta;
      console.log(
        `  ✓ adjusted by ${delta} (now ${currentMongoBalance + delta})`,
      );
    } else {
      console.log(`  ✓ no adjustment needed`);
    }
  }
  console.log("");
}

/* ── Step 4: stock_holdings (stock_prices 보다 먼저 — verify 시 가격 의존성 없음) ── */

async function migrateStockHoldings(
  sqlite: Database.Database,
  userMap: DiscordIdMap,
  args: CliArgs,
  stats: MigrationStats,
): Promise<void> {
  const rows = sqlite
    .prepare<[], SqliteStockHoldingRow>(
      "SELECT user_id, ticker, shares, avg_price FROM stock_holdings WHERE shares > 0",
    )
    .all();

  console.log(`[4/8] Stock holdings: ${rows.length} (user, ticker) pairs (shares > 0)`);

  if (args.dryRun) {
    const byTicker = new Map<string, { holders: number; total: number }>();
    for (const r of rows) {
      const slot = byTicker.get(r.ticker) ?? { holders: 0, total: 0 };
      slot.holders += 1;
      slot.total += r.shares;
      byTicker.set(r.ticker, slot);
    }
    for (const [ticker, agg] of [...byTicker.entries()].sort()) {
      console.log(`  - ${ticker}: ${agg.holders} holders, total ${agg.total} shares`);
    }
    console.log("");
    stats.stockHoldings = rows.length;
    return;
  }

  // upsert 직접 사용 (buyHolding 은 가중평균 계산 — 마이그는 avg_price 그대로 보존해야 함).
  const col = await stockHoldingsCol();
  for (const r of rows) {
    const discordId = String(r.user_id);
    const entry = userMap.get(discordId);
    if (!entry) {
      throw new Error(
        `Internal: discordId ${discordId} missing from userMap during stock_holdings migration.`,
      );
    }
    await col.updateOne(
      { userId: entry.userId, ticker: r.ticker },
      {
        $set: {
          shares: r.shares,
          avgPrice: r.avg_price,
          updatedAt: new Date(),
        },
        $setOnInsert: { userId: entry.userId, ticker: r.ticker },
      },
      { upsert: true },
    );
    stats.stockHoldings += 1;
  }
  console.log(`  ✓ upserted ${stats.stockHoldings} holdings`);
  console.log("");
}

/* ── Step 5: stock_prices ── */

async function migrateStockPrices(
  sqlite: Database.Database,
  args: CliArgs,
  stats: MigrationStats,
): Promise<void> {
  const rows = sqlite
    .prepare<[], SqliteStockPriceRow>(
      "SELECT ticker, price, prev_price, event_text, last_update FROM stock_prices",
    )
    .all();

  console.log(`[5/8] Stock prices: ${rows.length} tickers`);

  if (args.dryRun) {
    for (const r of rows) {
      console.log(`  - ${r.ticker} @ ${r.price} (prev ${r.prev_price})`);
    }
    console.log("");
    stats.stockPrices = rows.length;
    return;
  }

  // ensureStockPrice 는 이미 있으면 skip (price 동기화 안 함). 마이그에서는 prevPrice/eventText/lastUpdate 까지
  // SQLite snapshot 으로 정확히 보존해야 하므로 raw upsert 로 처리.
  const col = await stockPricesCol();
  for (const r of rows) {
    await col.updateOne(
      { ticker: r.ticker },
      {
        $set: {
          price: r.price,
          prevPrice: r.prev_price,
          eventText: r.event_text ?? "상장",
          lastUpdate: r.last_update,
        },
        $setOnInsert: { ticker: r.ticker },
      },
      { upsert: true },
    );
    stats.stockPrices += 1;
  }
  console.log(`  ✓ upserted ${stats.stockPrices} prices`);
  console.log("");
}

/* ── Step 6: shop_inventory ── */

async function migrateShopInventory(
  sqlite: Database.Database,
  userMap: DiscordIdMap,
  args: CliArgs,
  stats: MigrationStats,
): Promise<void> {
  const rows = sqlite
    .prepare<[], SqliteInventoryRow>(
      "SELECT user_id, item_id, quantity FROM inventory WHERE quantity > 0",
    )
    .all();

  console.log(`[6/8] Shop inventory: ${rows.length} (user, item) pairs (quantity > 0)`);

  if (args.dryRun) {
    for (const r of rows.slice(0, 10)) {
      console.log(`  - user ${r.user_id} × ${r.item_id} = ${r.quantity}`);
    }
    if (rows.length > 10) console.log(`  ... +${rows.length - 10} more`);
    console.log("");
    stats.shopInventory = rows.length;
    return;
  }

  const col = await shopInventoryCol();
  for (const r of rows) {
    const discordId = String(r.user_id);
    const entry = userMap.get(discordId);
    if (!entry) {
      throw new Error(
        `Internal: discordId ${discordId} missing from userMap during shop_inventory migration.`,
      );
    }
    await col.updateOne(
      { userId: entry.userId, itemId: r.item_id },
      {
        $set: { quantity: r.quantity, updatedAt: new Date() },
        $setOnInsert: { userId: entry.userId, itemId: r.item_id },
      },
      { upsert: true },
    );
    stats.shopInventory += 1;
  }
  console.log(`  ✓ upserted ${stats.shopInventory} inventory rows`);
  console.log("");
}

/* ── Step 7: shop_daily_stock ── */

async function migrateShopDailyStock(
  sqlite: Database.Database,
  args: CliArgs,
  stats: MigrationStats,
): Promise<void> {
  const rows = sqlite
    .prepare<[], SqliteDailyStockRow>(
      "SELECT item_id, stock, last_refresh FROM daily_stock",
    )
    .all();

  console.log(`[7/8] Daily stock: ${rows.length} items`);

  if (args.dryRun) {
    for (const r of rows.slice(0, 10)) {
      console.log(`  - ${r.item_id}: stock=${r.stock} lastRefresh=${r.last_refresh}`);
    }
    if (rows.length > 10) console.log(`  ... +${rows.length - 10} more`);
    console.log("");
    stats.shopDailyStock = rows.length;
    return;
  }

  const col = await shopDailyStockCol();
  for (const r of rows) {
    await col.updateOne(
      { itemId: r.item_id },
      {
        $set: { stock: r.stock, lastRefresh: r.last_refresh },
        $setOnInsert: { itemId: r.item_id },
      },
      { upsert: true },
    );
    stats.shopDailyStock += 1;
  }
  console.log(`  ✓ upserted ${stats.shopDailyStock} daily_stock rows`);
  console.log("");
}

/* ── Step 8: trade_log skip ── */

function logTradeLogSkip(): void {
  console.log(`[8/8] trade_log: SKIP (PLAN ignored — not migrated)`);
  console.log("");
}

/* ── Verification ── */

async function verify(
  sqlite: Database.Database,
  userMap: DiscordIdMap,
  args: CliArgs,
): Promise<boolean> {
  console.log(`=== VERIFICATION ===`);

  // SQLite 기준 합계.
  const sqliteCreditTotal =
    sqlite
      .prepare<[], { sum: number | null }>(
        "SELECT COALESCE(SUM(balance), 0) AS sum FROM credits WHERE balance >= 0",
      )
      .get()?.sum ?? 0;
  const sqliteEligibleCount =
    sqlite
      .prepare<[], { c: number }>(
        "SELECT COUNT(*) AS c FROM credits WHERE balance >= 0",
      )
      .get()?.c ?? 0;
  const sqliteOpPool =
    sqlite
      .prepare<[], { balance: number | null }>("SELECT balance FROM operation_pool WHERE id=1")
      .get()?.balance ?? 0;
  const sqliteHoldingsCount =
    sqlite
      .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM stock_holdings WHERE shares > 0")
      .get()?.c ?? 0;
  const sqliteInventoryCount =
    sqlite
      .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM inventory WHERE quantity > 0")
      .get()?.c ?? 0;
  const sqliteStockPricesCount =
    sqlite.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM stock_prices").get()?.c ?? 0;
  const sqliteDailyStockCount =
    sqlite.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM daily_stock").get()?.c ?? 0;

  // SQLite 사용자별 총자산 (balance + 보유주 평가액). balance < 0 user 는 ledger 미생성이므로 검증에서도 제외.
  const sqliteAssetsByUser = sqlite
    .prepare<[], { user_id: number | bigint; assets: number }>(
      `SELECT c.user_id AS user_id,
              c.balance + COALESCE((SELECT SUM(h.shares * p.price)
                                     FROM stock_holdings h
                                     JOIN stock_prices p ON p.ticker = h.ticker
                                     WHERE h.user_id = c.user_id
                                       AND h.shares > 0), 0) AS assets
         FROM credits c
        WHERE c.balance >= 0`,
    )
    .all();

  if (args.dryRun) {
    console.log(
      `  Will check (after --execute): SUM matching, count matching, 사용자별 총자산 일치`,
    );
    console.log(`    expected: SUM(credits.balance, balance>=0)= ${sqliteCreditTotal}`);
    console.log(`    expected: ledger-eligible users           = ${sqliteEligibleCount}`);
    console.log(`    expected: operation_pool.balance          = ${sqliteOpPool}`);
    console.log(`    expected: stock_holdings COUNT (>0)       = ${sqliteHoldingsCount}`);
    console.log(`    expected: inventory COUNT (>0)            = ${sqliteInventoryCount}`);
    console.log(`    expected: stock_prices COUNT              = ${sqliteStockPricesCount}`);
    console.log(`    expected: daily_stock COUNT               = ${sqliteDailyStockCount}`);
    console.log("");
    return true;
  }

  // Mongo 기준 합계.
  const db = await getDb();
  const tag = `${MIGRATION_DESC_PREFIX}${args.migrationTag}`;

  // userMap → 마이그 대상 userIds 로 한정해 verify.
  const userIds = [...userMap.values()].map((e) => e.userId).filter(Boolean);
  if (userIds.length === 0) {
    console.error("  ✗ no userIds resolved from userMap (cannot verify).");
    return false;
  }

  // user별 latest balance (마이그 대상 user 만 합산 — 이종 ledger / leftover 영향 차단).
  const ledgerSumAgg = await db
    .collection("credit_transactions")
    .aggregate<{ _id: string; latestBalance: number }>([
      { $match: { userId: { $in: userIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$userId",
          latestBalance: { $first: "$balance" },
        },
      },
    ])
    .toArray();

  const mongoLedgerSum = ledgerSumAgg.reduce((acc, r) => acc + (r.latestBalance ?? 0), 0);

  const pool = await getCreditPool(OPERATION_POOL_ID);
  const mongoOpPool = pool?.balance ?? 0;

  const stockHoldingsColInst = await stockHoldingsCol();
  const shopInventoryColInst = await shopInventoryCol();
  const stockPricesColInst = await stockPricesCol();
  const shopDailyStockColInst = await shopDailyStockCol();
  const creditTransactionsColInst = await creditTransactionsCol();

  const mongoHoldingsCount = await stockHoldingsColInst.countDocuments({
    shares: { $gt: 0 },
  });
  const mongoInventoryCount = await shopInventoryColInst.countDocuments({
    quantity: { $gt: 0 },
  });
  const mongoStockPricesCount = await stockPricesColInst.countDocuments();
  const mongoDailyStockCount = await shopDailyStockColInst.countDocuments();

  const tagLedgerCount = await creditTransactionsColInst.countDocuments({
    description: { $regex: `^${escapeRegex(tag)}` },
  });

  let ok = true;
  const checks: { label: string; want: number; got: number }[] = [
    { label: "SUM(latest credit_transactions.balance)", want: sqliteCreditTotal, got: mongoLedgerSum },
    { label: "credit_pools[OPERATION].balance", want: sqliteOpPool, got: mongoOpPool },
    { label: "stock_holdings COUNT (shares>0)", want: sqliteHoldingsCount, got: mongoHoldingsCount },
    { label: "shop_inventory COUNT (quantity>0)", want: sqliteInventoryCount, got: mongoInventoryCount },
    { label: "stock_prices COUNT", want: sqliteStockPricesCount, got: mongoStockPricesCount },
    { label: "shop_daily_stock COUNT", want: sqliteDailyStockCount, got: mongoDailyStockCount },
    {
      label: `MIGRATION ledger rows (tag=${args.migrationTag})`,
      want: sqliteEligibleCount,
      got: tagLedgerCount,
    },
  ];
  for (const c of checks) {
    const pass = c.want === c.got;
    if (!pass) ok = false;
    const mark = pass ? "✓" : "✗";
    console.log(`  ${mark} ${c.label}: ${c.got} (expected ${c.want})`);
  }

  // 사용자별 총자산 검증 — Promise.all 로 병렬 (user 수가 적어 단순 패턴 유지).
  const stockPriceMap = new Map<string, number>();
  for (const p of await stockPricesColInst.find().toArray()) {
    stockPriceMap.set(p.ticker, p.price);
  }

  const userAssetResults = await Promise.all(
    sqliteAssetsByUser.map(async (row) => {
      const discordId = String(row.user_id);
      const entry = userMap.get(discordId);
      if (!entry || !entry.userId) {
        return { discordId, sqliteAssets: row.assets, mongoAssets: null as number | null };
      }
      const userId = entry.userId;
      const [latestRow, holdings] = await Promise.all([
        creditTransactionsColInst
          .find({ userId })
          .sort({ createdAt: -1 })
          .limit(1)
          .toArray(),
        stockHoldingsColInst.find({ userId, shares: { $gt: 0 } }).toArray(),
      ]);
      const ledger = latestRow[0]?.balance ?? 0;
      let stockValue = 0;
      for (const h of holdings) {
        const price = stockPriceMap.get(h.ticker) ?? 0;
        stockValue += h.shares * price;
      }
      return { discordId, sqliteAssets: row.assets, mongoAssets: ledger + stockValue };
    }),
  );

  let assetMismatchCount = 0;
  let assetSkippedCount = 0;
  for (const r of userAssetResults) {
    if (r.mongoAssets === null) {
      assetSkippedCount += 1;
      continue;
    }
    if (r.mongoAssets !== r.sqliteAssets) {
      assetMismatchCount += 1;
      console.log(
        `  ✗ user ${r.discordId}: assets mongo=${r.mongoAssets} sqlite=${r.sqliteAssets}`,
      );
    }
  }
  if (assetMismatchCount === 0) {
    console.log(
      `  ✓ 사용자별 총자산 일치 (${sqliteAssetsByUser.length - assetSkippedCount} users` +
        (assetSkippedCount > 0 ? `, ${assetSkippedCount} skipped` : "") +
        `)`,
    );
  } else {
    ok = false;
    console.log(
      `  ✗ 사용자별 총자산 mismatch: ${assetMismatchCount}/${sqliteAssetsByUser.length}`,
    );
  }

  console.log("");
  return ok;
}

/* ── Summary ── */

function printSummary(stats: MigrationStats, args: CliArgs, verifyOk: boolean): void {
  console.log(`=== SUMMARY ===`);
  if (args.dryRun) {
    const total =
      stats.users +
      stats.ledgerInserts +
      (stats.poolDelta !== 0 ? 1 : 0) +
      stats.stockHoldings +
      stats.stockPrices +
      stats.shopInventory +
      stats.shopDailyStock;
    console.log(`Total writes planned: ${total}`);
    console.log(`Run with \`--execute --yes\` to apply.`);
  } else if (args.verifyOnly) {
    console.log(`Verify-only mode: ${verifyOk ? "PASS" : "FAIL"}`);
  } else {
    const total =
      stats.users +
      stats.ledgerInserts +
      (stats.poolDelta !== 0 ? 1 : 0) +
      stats.stockHoldings +
      stats.stockPrices +
      stats.shopInventory +
      stats.shopDailyStock;
    console.log(`Total writes: ${total}`);
    console.log(`  - users upserted:            ${stats.users}`);
    console.log(`  - credit ledger inserts:     ${stats.ledgerInserts} (skipped ${stats.ledgerSkipped})`);
    console.log(`  - operation pool delta:      ${stats.poolDelta} (final ${stats.poolBalance})`);
    console.log(`  - stock holdings upserts:    ${stats.stockHoldings}`);
    console.log(`  - stock prices upserts:      ${stats.stockPrices}`);
    console.log(`  - shop_inventory upserts:    ${stats.shopInventory}`);
    console.log(`  - shop_daily_stock upserts:  ${stats.shopDailyStock}`);
    console.log(`Verification: ${verifyOk ? "PASS ✓" : "FAIL ✗"}`);
    console.log(`=== DONE ===`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
