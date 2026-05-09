/**
 * 1회성 — 두 DB(trpg_bot, stargate)의 컬렉션 카운트 + sessions 분포 진단.
 *
 * Usage:
 *   MONGODB_URI=$(grep '^MONGODB_URI=' StarGateV2/.env.local | cut -d'=' -f2-) \
 *     pnpm --filter @stargate/shared-db exec tsx scripts/inspect-mongo-dbs.ts
 *
 * Or:
 *   pnpm --filter @stargate/shared-db exec tsx scripts/inspect-mongo-dbs.ts --mongodb-uri="..."
 */

import { MongoClient } from "mongodb";
import process from "node:process";

const DBS = ["trpg_bot", "stargate"] as const;

function parseUri(): string {
  const argv = process.argv.slice(2);
  const arg = argv.find((a) => a.startsWith("--mongodb-uri="));
  const uri = arg ? arg.slice("--mongodb-uri=".length) : process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI 환경변수 또는 --mongodb-uri 필요");
    process.exit(1);
  }
  return uri;
}

function maskUri(uri: string): string {
  return uri.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1***$2");
}

async function main() {
  const uri = parseUri();
  console.log("=== Mongo DB 진단 ===");
  console.log(`URI: ${maskUri(uri)}`);
  console.log();

  const client = new MongoClient(uri);
  await client.connect();
  try {
    for (const dbName of DBS) {
      console.log(`=== ${dbName} ===`);
      const db = client.db(dbName);
      const cols = await db.listCollections().toArray();
      if (cols.length === 0) {
        console.log("  (컬렉션 없음)");
        console.log();
        continue;
      }
      // 컬렉션별 카운트
      const counts: { name: string; count: number }[] = [];
      for (const c of cols) {
        const cnt = await db.collection(c.name).estimatedDocumentCount();
        counts.push({ name: c.name, count: cnt });
      }
      counts.sort((a, b) => b.count - a.count);
      for (const { name, count } of counts) {
        console.log(`  ${name.padEnd(35)} ${count.toLocaleString()}`);
      }

      // sessions 상태 분포 (있으면)
      if (cols.find((c) => c.name === "sessions")) {
        const dist = await db
          .collection("sessions")
          .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
          .toArray();
        if (dist.length > 0) {
          console.log(`\n  sessions.status 분포:`);
          for (const d of dist) {
            console.log(`    ${(d._id ?? "(null)").toString().padEnd(15)} ${d.count}`);
          }
        }
      }

      // users 의 discordId 분포
      if (cols.find((c) => c.name === "users")) {
        const withDiscord = await db
          .collection("users")
          .countDocuments({ discordId: { $type: "string" } });
        const total = await db.collection("users").estimatedDocumentCount();
        console.log(`\n  users.discordId string: ${withDiscord} / ${total}`);
      }

      console.log();
    }

    // 두 DB 의 users.discordId overlap (있을 때만)
    const t = client.db("trpg_bot");
    const s = client.db("stargate");
    const tHasUsers = await t.listCollections({ name: "users" }).hasNext();
    const sHasUsers = await s.listCollections({ name: "users" }).hasNext();
    if (tHasUsers && sHasUsers) {
      const tIds = new Set<string>();
      for await (const u of t.collection("users").find({ discordId: { $type: "string" } }, { projection: { discordId: 1 } })) {
        tIds.add(u.discordId as string);
      }
      const sIds = new Set<string>();
      for await (const u of s.collection("users").find({ discordId: { $type: "string" } }, { projection: { discordId: 1 } })) {
        sIds.add(u.discordId as string);
      }
      const overlap = [...tIds].filter((id) => sIds.has(id)).length;
      const onlyTrpg = [...tIds].filter((id) => !sIds.has(id)).length;
      const onlyStargate = [...sIds].filter((id) => !tIds.has(id)).length;
      console.log("=== users.discordId 비교 ===");
      console.log(`  trpg_bot 만:    ${onlyTrpg}`);
      console.log(`  stargate 만:    ${onlyStargate}`);
      console.log(`  양쪽 overlap:   ${overlap}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
