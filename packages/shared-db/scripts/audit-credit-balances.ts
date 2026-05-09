/**
 * 1회성 — 모든 AGENT/MAIN character 의 크레딧 잔액 + 최근 거래 출력.
 *
 * Usage:
 *   MONGODB_URI=$(grep '^MONGODB_URI=' StarGateV2/.env.local | cut -d'=' -f2-) \
 *     pnpm --filter @stargate/shared-db exec tsx scripts/audit-credit-balances.ts
 */

import { MongoClient, type Document } from "mongodb";
import process from "node:process";

function parseUri(): string {
  const argv = process.argv.slice(2);
  const arg = argv.find((a) => a.startsWith("--mongodb-uri="));
  const uri = arg ? arg.slice("--mongodb-uri=".length) : process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI 환경변수 필요");
    process.exit(1);
  }
  return uri;
}

function extractDbName(uri: string): string {
  const m = uri.match(/\/\/[^/]+\/([^?]+)/);
  return m ? m[1] : "stargate";
}

function maskUri(uri: string): string {
  return uri.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1***$2");
}

async function main() {
  const uri = parseUri();
  const dbName = extractDbName(uri);
  console.log("=== 크레딧 잔액 감사 ===");
  console.log(`Mongo: ${maskUri(uri)}`);
  console.log(`DB: ${dbName}`);
  console.log();

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(dbName);
    const charactersCol = db.collection("characters");
    const txCol = db.collection("credit_transactions");

    // 1. 모든 AGENT/MAIN 캐릭터
    const agents = await charactersCol
      .find({
        type: "AGENT",
        $or: [{ tier: "MAIN" }, { tier: { $exists: false } }],
      })
      .sort({ codename: 1 })
      .toArray();

    console.log(`[AGENT/MAIN] 총 ${agents.length}건`);
    console.log();

    // 2. 각 캐릭 잔액 + 최근 1건
    const results: Array<{
      codename: string;
      ownerId: string | null;
      txCount: number;
      balance: number;
      lastTxDate: string;
      lastTxType: string;
      lastTxAmount: number;
      ledgerKinds: string[];
    }> = [];

    for (const c of agents) {
      const characterId = c._id.toHexString();
      const txs = await txCol
        .find({ characterId })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
      const latest = txs[0];
      const types = [...new Set(txs.map((t) => (t as Document).type as string))];
      results.push({
        codename: c.codename as string,
        ownerId: (c.ownerId ?? null) as string | null,
        txCount: txs.length,
        balance: latest ? (latest.balance as number) : 0,
        lastTxDate: latest ? (latest.createdAt as Date).toISOString().slice(0, 16) : "(없음)",
        lastTxType: latest ? (latest.type as string) : "(없음)",
        lastTxAmount: latest ? (latest.amount as number) : 0,
        ledgerKinds: types,
      });
    }

    // 3. 출력
    console.log(
      "codename".padEnd(20),
      "tx".padStart(4),
      "balance".padStart(10),
      "최근거래".padEnd(20),
      "type",
    );
    console.log("─".repeat(75));
    for (const r of results) {
      console.log(
        r.codename.padEnd(20),
        String(r.txCount).padStart(4),
        String(r.balance).padStart(10),
        r.lastTxDate.padEnd(20),
        r.lastTxType,
      );
    }

    // 4. 요약
    const totalBalance = results.reduce((s, r) => s + r.balance, 0);
    const withTx = results.filter((r) => r.txCount > 0).length;
    const zero = results.filter((r) => r.balance === 0).length;

    console.log();
    console.log("=== 요약 ===");
    console.log(`총 캐릭터: ${results.length}`);
    console.log(`거래 1건+: ${withTx}`);
    console.log(`잔액 0:    ${zero}`);
    console.log(`총 잔액 합: ${totalBalance.toLocaleString()} CR`);

    // 5. type 분포
    const allTypes: Record<string, number> = {};
    for (const r of results) {
      for (const t of r.ledgerKinds) {
        allTypes[t] = (allTypes[t] ?? 0) + 1;
      }
    }
    console.log();
    console.log("=== ledger type 분포 (캐릭터 수 기준) ===");
    for (const [t, n] of Object.entries(allTypes).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${t.padEnd(20)} ${n}`);
    }

    // 6. credit_pools
    console.log();
    console.log("=== credit_pools ===");
    const poolsCol = db.collection("credit_pools");
    const pools = await poolsCol.find({}).toArray();
    if (pools.length === 0) {
      console.log("  (없음)");
    } else {
      for (const p of pools) {
        console.log(`  ${(p.poolId as string).padEnd(15)} balance=${p.balance} (${p.name})`);
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
