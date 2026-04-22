/**
 * users 컬렉션 로컬 JSON 백업 (Atlas M0 Free tier 보완)
 *
 * 사용법:
 *   pnpm tsx scripts/backup-users-json.ts
 *
 * 출력: ./backup-users-<ISO_TS>.json (프로젝트 루트)
 */

import { writeFileSync, readFileSync } from "fs";
import { resolve } from "path";

import { MongoClient } from "mongodb";

// .env.local 수동 로드
const envPath = resolve(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local 없으면 환경변수에서 직접 읽음
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

async function main() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI 환경변수가 필요합니다.");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const users = await db.collection("users").find({}).toArray();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-users-${timestamp}.json`;
    const outPath = resolve(process.cwd(), filename);

    writeFileSync(outPath, JSON.stringify(users, null, 2), "utf-8");

    console.log(`백업 완료: ${outPath}`);
    console.log(`  총 ${users.length}개 문서`);
    console.log("");
    console.log("복원 시:");
    console.log(`  db.users.drop();`);
    console.log(`  mongoimport --uri "<MONGODB_URI>/stargate" --collection users --file ${filename} --jsonArray`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("백업 실패:", err);
  process.exit(1);
});
