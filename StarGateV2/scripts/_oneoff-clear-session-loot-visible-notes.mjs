import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MongoClient } from "mongodb";

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const SCOPE = "GLOBAL";
const TARGET_NOTE = "미지급 전리품 백필 — 사용자 제공 보상표";
const TARGETS = new Map([
  ["zulu-0028-contained-entity", 1],
  ["broken-syllable", 3],
  ["zulu-0040-crown-specimen", 1],
  ["zulu-0872-3-dongsik-wings", 1],
  ["kerub-fireblade", 1],
  ["montauk-slaughter-hound-appearance-plate", 1],
  ["conductor-corpse", 1],
  ["conductor-record-spindle", 3],
  ["golden-dawn-cultist-mask", 5],
  ["inverted-sock-contained-entity", 1],
  ["white-rose-assistant-call", 1],
]);

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function readTargets(db, session) {
  const masters = await db
    .collection("master_items")
    .find({ slug: { $in: [...TARGETS.keys()] } }, { session })
    .toArray();
  assertCondition(
    masters.length === TARGETS.size,
    `대상 master_items는 ${TARGETS.size}건이어야 합니다: ${masters.length}`,
  );
  const slugByItemId = new Map(
    masters.map((item) => [item._id.toString(), item.slug]),
  );
  const entries = await db
    .collection("shared_inventory")
    .find(
      {
        scope: SCOPE,
        itemId: { $in: [...slugByItemId.keys()] },
      },
      { session },
    )
    .toArray();
  assertCondition(
    entries.length === TARGETS.size,
    `대상 shared_inventory는 ${TARGETS.size}행이어야 합니다: ${entries.length}`,
  );

  let total = 0;
  const rows = entries
    .map((entry) => {
      const slug = slugByItemId.get(entry.itemId);
      const expectedQuantity = TARGETS.get(slug);
      assertCondition(
        entry.quantity === expectedQuantity,
        `${slug}: 수량이 지급 결과와 다릅니다.`,
      );
      total += entry.quantity;
      return {
        slug,
        quantity: entry.quantity,
        note: entry.note ?? null,
        targetNote: entry.note === TARGET_NOTE,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
  assertCondition(total === 19, `대상 총 수량이 19가 아닙니다: ${total}`);
  return { rows, total, itemIds: [...slugByItemId.keys()] };
}

loadEnvFile(".env.local");
loadEnvFile(".env");

if (EXECUTE && !YES) {
  throw new Error("실행에는 --execute --yes가 모두 필요합니다.");
}
assertCondition(process.env.MONGODB_URI, "MONGODB_URI가 필요합니다.");

const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 2 });

try {
  await client.connect();
  const db = client.db(process.env.DB_NAME || "stargate");
  const before = await readTargets(db);
  const targetCount = before.rows.filter((row) => row.targetNote).length;
  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? "execute" : "dry-run",
        scope: SCOPE,
        targetRows: targetCount,
        rows: before.rows,
      },
      null,
      2,
    ),
  );

  if (EXECUTE) {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await readTargets(db, session);
        const currentTargetCount = current.rows.filter(
          (row) => row.targetNote,
        ).length;
        const result = await db.collection("shared_inventory").updateMany(
          {
            scope: SCOPE,
            itemId: { $in: current.itemIds },
            note: TARGET_NOTE,
          },
          { $unset: { note: "" } },
          { session },
        );
        assertCondition(
          result.modifiedCount === currentTargetCount,
          `note 제거 수가 예상과 다릅니다: ${result.modifiedCount}/${currentTargetCount}`,
        );
      });
    } finally {
      await session.endSession();
    }
  }

  const after = await readTargets(db);
  const remaining = after.rows.filter((row) => row.targetNote).length;
  if (EXECUTE) {
    assertCondition(remaining === 0, `표시용 note가 ${remaining}행 남았습니다.`);
  }
  console.log(
    JSON.stringify(
      {
        verified: {
          rows: after.rows.length,
          total: after.total,
          remainingTargetNotes: remaining,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
