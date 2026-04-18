/**
 * DB 통합 마이그레이션 스크립트
 *
 * stargate_erp + registrar_bot → stargate (단일 DB)
 *
 * ⚠️ 중요: 실행 전 양 서비스(StarGateV2, registra-bot)를 **반드시 중지**하세요.
 * 실시간 쓰기가 발생하면 스냅샷 기준 복사 이후의 레코드가 누락됩니다.
 *
 * 권장 배포 순서:
 *   1. 두 서비스 중지
 *   2. DRY_RUN=1 pnpm tsx scripts/migrate-to-unified-db.ts  (검증)
 *   3. pnpm tsx scripts/migrate-to-unified-db.ts             (실제 복사)
 *   4. 신버전 배포 (DB_NAME=stargate 사용)
 *   5. 원본 DB(stargate_erp, registrar_bot)는 수동 검증 후 삭제
 *
 * 환경변수:
 *   MONGODB_URI (필수)
 *   SOURCE_ERP_DB (기본: stargate_erp)
 *   SOURCE_REGISTRAR_DB (기본: registrar_bot)
 *   TARGET_DB (기본: stargate)
 *   BATCH_SIZE (기본: 1000)
 *   DRY_RUN (1=true, 기타=false)
 */

import "dotenv/config";
import { MongoClient, type Collection } from "mongodb";

const ERP_COLLECTIONS = [
  "users",
  "characters",
  "credit_transactions",
  "master_items",
  "character_inventory",
  "wiki_pages",
  "wiki_page_revisions",
  "session_reports",
  "notifications",
];

const REGISTRAR_COLLECTIONS = [
  "sessions",
  "session_responses",
  "session_logs",
  "registrar_user_tips",
];

/** unique index가 걸려있어 upsert로 처리해야 하는 컬렉션 */
const UPSERT_COLLECTIONS = new Set(["users"]);

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const SOURCE_ERP_DB = process.env.SOURCE_ERP_DB ?? "stargate_erp";
const SOURCE_REGISTRAR_DB = process.env.SOURCE_REGISTRAR_DB ?? "registrar_bot";
const TARGET_DB = process.env.TARGET_DB ?? "stargate";

const rawBatch = Number(process.env.BATCH_SIZE ?? "1000");
const BATCH_SIZE =
  Number.isFinite(rawBatch) && rawBatch > 0 ? rawBatch : 1000;

const DRY_RUN = process.env.DRY_RUN === "1";

interface CopyStats {
  source: number;
  targetBefore: number;
  targetAfter: number;
  copied: number;
  skipped: number;
  errors: number;
}

async function copyCollection(
  client: MongoClient,
  sourceDb: string,
  targetDb: string,
  collName: string
): Promise<CopyStats> {
  const src = client.db(sourceDb).collection(collName);
  const tgt = client.db(targetDb).collection(collName);

  const sourceCount = await src.countDocuments();
  const targetBefore = await tgt.countDocuments();

  console.log(
    `  [${sourceDb}.${collName}] source=${sourceCount} target(before)=${targetBefore}`
  );

  const base: CopyStats = {
    source: sourceCount,
    targetBefore,
    targetAfter: targetBefore,
    copied: 0,
    skipped: 0,
    errors: 0,
  };

  if (DRY_RUN || sourceCount === 0) {
    return base;
  }

  let copied = 0;
  let skipped = 0;
  let errors = 0;

  const cursor = src.find({});
  let batch: unknown[] = [];
  const useUpsert = UPSERT_COLLECTIONS.has(collName);

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      const stats = await flushBatch(tgt, batch, useUpsert);
      copied += stats.copied;
      skipped += stats.skipped;
      errors += stats.errors;
      batch = [];
    }
  }
  if (batch.length > 0) {
    const stats = await flushBatch(tgt, batch, useUpsert);
    copied += stats.copied;
    skipped += stats.skipped;
    errors += stats.errors;
  }

  const targetAfter = await tgt.countDocuments();
  console.log(
    `  [${sourceDb}.${collName}] copied=${copied} skipped=${skipped} errors=${errors} target(after)=${targetAfter}`
  );

  return {
    source: sourceCount,
    targetBefore,
    targetAfter,
    copied,
    skipped,
    errors,
  };
}

async function flushBatch(
  tgt: Collection,
  batch: unknown[],
  useUpsert: boolean
): Promise<{ copied: number; skipped: number; errors: number }> {
  if (useUpsert) {
    // users 등 unique index 충돌 가능 → _id 기준 upsert ($setOnInsert로 멱등)
    let upserted = 0;
    let untouched = 0;
    for (const doc of batch as Array<{ _id?: unknown }>) {
      if (!doc._id) continue;
      try {
        const res = await tgt.updateOne(
          { _id: doc._id } as never,
          { $setOnInsert: doc as never },
          { upsert: true }
        );
        if (res.upsertedCount > 0) upserted += 1;
        else untouched += 1;
      } catch {
        // upsert 실패는 대개 username/discordId unique 충돌 — 대상에 이미 있는 유저
        untouched += 1;
      }
    }
    return { copied: upserted, skipped: untouched, errors: 0 };
  }

  try {
    const result = await tgt.insertMany(batch as never[], { ordered: false });
    return {
      copied: result.insertedCount,
      skipped: batch.length - result.insertedCount,
      errors: 0,
    };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "result" in err &&
      err.result &&
      typeof err.result === "object"
    ) {
      const r = err.result as {
        insertedCount?: number;
        writeErrors?: Array<{ code?: number; errmsg?: string }>;
      };
      const inserted = r.insertedCount ?? 0;
      const writeErrors = r.writeErrors ?? [];
      const dupCount = writeErrors.filter((e) => e.code === 11_000).length;
      const otherCount = writeErrors.length - dupCount;

      if (otherCount > 0) {
        const sample = writeErrors
          .filter((e) => e.code !== 11_000)
          .slice(0, 3)
          .map((e) => e.errmsg);
        console.warn(`    ⚠️  non-duplicate write errors (${otherCount}):`, sample);
      }

      return { copied: inserted, skipped: dupCount, errors: otherCount };
    }
    throw err;
  }
}

async function main() {
  console.log(`\n=== DB 통합 마이그레이션 ===`);
  console.log(`Source (ERP): ${SOURCE_ERP_DB}`);
  console.log(`Source (Registrar): ${SOURCE_REGISTRAR_DB}`);
  console.log(`Target: ${TARGET_DB}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`DRY_RUN: ${DRY_RUN ? "YES (복사 안 함)" : "NO (실제 복사)"}`);
  console.log(
    `\n⚠️  실행 전 양 서비스(StarGateV2, registra-bot)를 중지했는지 확인하세요.\n`
  );

  const client = new MongoClient(uri!, { maxPoolSize: 5 });
  await client.connect();

  try {
    const summary: Record<string, CopyStats> = {};

    console.log(`[1/2] ERP 컬렉션 복사: ${SOURCE_ERP_DB} → ${TARGET_DB}`);
    for (const coll of ERP_COLLECTIONS) {
      summary[`${SOURCE_ERP_DB}.${coll}`] = await copyCollection(
        client,
        SOURCE_ERP_DB,
        TARGET_DB,
        coll
      );
    }

    console.log(
      `\n[2/2] Registrar 컬렉션 복사: ${SOURCE_REGISTRAR_DB} → ${TARGET_DB}`
    );
    for (const coll of REGISTRAR_COLLECTIONS) {
      summary[`${SOURCE_REGISTRAR_DB}.${coll}`] = await copyCollection(
        client,
        SOURCE_REGISTRAR_DB,
        TARGET_DB,
        coll
      );
    }

    console.log(`\n=== 요약 ===`);
    let totalSource = 0;
    let totalCopied = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let hasWarning = false;

    for (const [key, stat] of Object.entries(summary)) {
      const srcStr = String(stat.source).padStart(6);
      const copStr = String(stat.copied).padStart(6);
      const skpStr = String(stat.skipped).padStart(6);
      const errStr = String(stat.errors).padStart(6);
      const newlyAdded = stat.targetAfter - stat.targetBefore;
      const gap = stat.source - stat.copied - stat.skipped - stat.errors;
      const flag = stat.errors > 0 || gap !== 0 ? "⚠️ " : "   ";
      if (flag.trim()) hasWarning = true;

      console.log(
        `  ${flag}${key.padEnd(46)} src=${srcStr} cop=${copStr} skp=${skpStr} err=${errStr} new=${newlyAdded}`
      );
      totalSource += stat.source;
      totalCopied += stat.copied;
      totalSkipped += stat.skipped;
      totalErrors += stat.errors;
    }
    console.log(
      `     ${"TOTAL".padEnd(46)} src=${String(totalSource).padStart(6)} cop=${String(totalCopied).padStart(6)} skp=${String(totalSkipped).padStart(6)} err=${String(totalErrors).padStart(6)}`
    );

    if (!DRY_RUN) {
      if (hasWarning) {
        console.log(
          `\n⚠️  일부 컬렉션에 에러 또는 누락이 있습니다. ⚠️ 마크된 항목을 수동 검증하세요.`
        );
      } else {
        console.log(`\n✅ 마이그레이션 완료. 원본 DB는 그대로 보존됨.`);
      }
      console.log(
        `   통합 DB 확인 후 수동으로 원본(${SOURCE_ERP_DB}, ${SOURCE_REGISTRAR_DB}) 삭제 가능.`
      );
    } else {
      console.log(`\n💡 DRY_RUN 모드. 실제 복사 안 함. 실행하려면 DRY_RUN 제거.`);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
