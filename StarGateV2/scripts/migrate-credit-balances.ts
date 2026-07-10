/**
 * credit_transactions의 최신 balance snapshot을 credit_balances SSOT로 backfill한다.
 *
 * 기본은 dry-run이다. 실제 쓰기는 명시적으로 `--execute --yes`를 함께 전달한다.
 * 배포 순서: `pnpm db:ensure-indexes` → writer 전환 → dry-run/risk review → execute.
 * Usage:
 *   pnpm migrate:credit-balances
 *   pnpm migrate:credit-balances -- --execute --yes --writers-upgraded
 */

import { MongoClient, type ObjectId } from "mongodb";

interface LatestLedgerBalance {
  _id: string;
  balance: number;
  lastTransactionId: string;
  updatedAt: Date;
}

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");

if (execute && (!args.has("--yes") || !args.has("--writers-upgraded"))) {
  throw new Error(
    "실행 모드는 --execute --yes --writers-upgraded를 함께 전달해야 합니다. " +
      "모든 ledger writer가 atomic addCredit 또는 동등한 dual-write로 전환됐는지 먼저 확인하세요.",
  );
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");

function dbNameFromUri(value: string): string {
  try {
    return new URL(value).pathname.slice(1) || "stargate";
  } catch {
    return "stargate";
  }
}

function maskUri(value: string): string {
  return value.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1***$2");
}

const client = new MongoClient(uri);
await client.connect();

try {
  const dbName = process.env.DB_NAME?.trim() || dbNameFromUri(uri);
  const db = client.db(dbName);
  const ledger = db.collection("credit_transactions");
  const balances = db.collection<{
    _id?: ObjectId;
    characterId: string;
    balance: number;
    lastTransactionId?: string;
    updatedAt: Date;
  }>("credit_balances");

  const readLedgerWatermark = async () => {
    const [count, latestRow] = await Promise.all([
      ledger.countDocuments({}),
      ledger.findOne({}, { sort: { createdAt: -1, _id: -1 }, projection: { _id: 1, createdAt: 1 } }),
    ]);
    return {
      count,
      latestId: latestRow?._id?.toString() ?? null,
      latestCreatedAt:
        latestRow?.createdAt instanceof Date
          ? latestRow.createdAt.toISOString()
          : String(latestRow?.createdAt ?? ""),
    };
  };

  const initialWatermark = await readLedgerWatermark();

  const latest = await ledger
    .aggregate<LatestLedgerBalance>([
      { $sort: { characterId: 1, createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: "$characterId",
          balance: { $first: "$balance" },
          lastTransactionId: { $first: { $toString: "$_id" } },
          updatedAt: { $first: "$createdAt" },
        },
      },
      { $match: { _id: { $type: "string" } } },
    ])
    .toArray();

  const existing = await balances
    .find({ characterId: { $in: latest.map((row) => row._id) } })
    .toArray();
  const existingById = new Map(existing.map((row) => [row.characterId, row]));
  const missing = latest.filter((row) => !existingById.has(row._id));
  const mismatches = latest.filter((row) => {
    const current = existingById.get(row._id);
    return current !== undefined && current.balance !== row.balance;
  });

  console.log(`[credit-balances] mode=${execute ? "EXECUTE" : "DRY-RUN"}`);
  console.log(`[credit-balances] mongo=${maskUri(uri)} db=${dbName}`);
  console.log(
    `[credit-balances] ledger=${latest.length} existing=${existing.length} missing=${missing.length} mismatched=${mismatches.length}`,
  );

  for (const row of mismatches.slice(0, 20)) {
    console.warn(
      `[credit-balances] mismatch characterId=${row._id} ledger=${row.balance} ssot=${existingById.get(row._id)?.balance}`,
    );
  }

  if (!execute) {
    console.log("[credit-balances] dry-run 완료. DB는 변경되지 않았습니다.");
  } else {
    const preWriteWatermark = await readLedgerWatermark();
    if (JSON.stringify(preWriteWatermark) !== JSON.stringify(initialWatermark)) {
      throw new Error(
        "마이그레이션 snapshot 계산 중 ledger write가 감지되어 실행을 중단했습니다.",
      );
    }
    const indexes = await balances.listIndexes().toArray().catch(() => []);
    const hasUniqueCharacterIndex = indexes.some(
      (index) =>
        index.unique === true &&
        index.key &&
        Object.keys(index.key).length === 1 &&
        index.key.characterId === 1,
    );
    if (!hasUniqueCharacterIndex) {
      throw new Error(
        "credit_balances characterId unique index가 없습니다. 먼저 pnpm db:ensure-indexes를 실행하고 재검증하세요.",
      );
    }
    if (missing.length > 0) {
      await balances.bulkWrite(
        missing.map((row) => ({
          updateOne: {
            filter: { characterId: row._id },
            update: {
              $setOnInsert: {
                characterId: row._id,
                balance: row.balance,
                lastTransactionId: row.lastTransactionId,
                updatedAt: row.updatedAt,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    const after = await balances
      .find({ characterId: { $in: latest.map((row) => row._id) } })
      .toArray();
    const afterById = new Map(after.map((row) => [row.characterId, row.balance]));
    const unresolved = latest.filter((row) => afterById.get(row._id) !== row.balance);
    const finalWatermark = await readLedgerWatermark();
    if (JSON.stringify(finalWatermark) !== JSON.stringify(initialWatermark)) {
      throw new Error(
        "마이그레이션 write 중 ledger watermark가 변경되었습니다. writer freeze 상태에서 다시 검증하세요.",
      );
    }
    console.log(
      `[credit-balances] verify expected=${latest.length} actual=${after.length} unresolved=${unresolved.length}`,
    );
    if (unresolved.length > 0) {
      throw new Error(
        `검증 실패: ledger snapshot과 SSOT가 다른 캐릭터 ${unresolved.length}건. 기존 SSOT는 자동 덮어쓰지 않았습니다.`,
      );
    }
  }
} finally {
  await client.close();
}
