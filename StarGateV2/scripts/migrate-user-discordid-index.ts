/**
 * users.discordId 인덱스 마이그레이션
 *
 * 배경:
 *   기존 `users_discordId_unique` 는 `sparse: true + unique`. MongoDB 의 sparse
 *   인덱스는 "필드가 존재하지 않는" 문서만 제외하고 "명시적 null 값"은 unique
 *   제약에 포함한다. createUser() 가 discordId:null 을 명시 insert 하므로
 *   두 번째 미연동 유저 생성 시 E11000 발생.
 *
 * 변경:
 *   sparse 인덱스 drop → partialFilterExpression({ discordId: { $type: "string" } })
 *   기반 새 인덱스 생성. string 타입일 때만 unique 검사 → null/missing 모두 제외.
 *
 * 사용법:
 *   # dry-run (기본, DB 쓰기 없음)
 *   npx tsx scripts/migrate-user-discordid-index.ts
 *
 *   # 실제 실행
 *   npx tsx scripts/migrate-user-discordid-index.ts --execute --yes
 *
 * 멱등성:
 *   기존 인덱스가 없으면 drop skip. 새 인덱스가 이미 있으면 createIndex 가 no-op.
 *   재실행해도 안전.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { MongoClient } from "mongodb";

// .env.local 수동 로드 (다른 migrate-* 스크립트 패턴 재사용)
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

const OLD_INDEX_NAME = "users_discordId_unique";
const NEW_INDEX_NAME = "users_discordId_partial_unique";

async function main() {
  const args = process.argv.slice(2);
  const hasExecute = args.includes("--execute");
  const hasYes = args.includes("--yes");
  const isExecute = hasExecute && hasYes;
  const isDryRun = !isExecute;

  if (hasExecute && !hasYes) {
    console.error(
      "[오류] --execute 는 반드시 --yes 와 함께 사용해야 합니다. 안전을 위해 중단.",
    );
    process.exit(1);
  }

  if (!MONGODB_URI) {
    console.error("[오류] MONGODB_URI 환경변수가 설정되지 않았습니다.");
    console.error(".env.local 파일을 확인하세요.");
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log(
    `users.discordId 인덱스 마이그레이션 (${isDryRun ? "DRY-RUN" : "EXECUTE"})`,
  );
  console.log("=".repeat(70));

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const users = db.collection("users");

    // 1. 현재 인덱스 확인
    console.log("\n[1/4] 현재 users 인덱스");
    const existing = await users.indexes();
    for (const idx of existing) {
      const keys = JSON.stringify(idx.key);
      const flags: string[] = [];
      if (idx.unique) flags.push("unique");
      if (idx.sparse) flags.push("sparse");
      if (idx.partialFilterExpression) flags.push("partial");
      console.log(
        `  ${String(idx.name).padEnd(40)} ${keys.padEnd(30)} ${flags.join(",")}`,
      );
    }

    // 2. discordId null 분포 확인
    console.log("\n[2/4] discordId 값 분포");
    const nullCount = await users.countDocuments({ discordId: null });
    const missingCount = await users.countDocuments({
      discordId: { $exists: false },
    });
    const stringCount = await users.countDocuments({
      discordId: { $type: "string" },
    });
    console.log(`  string       ${stringCount}`);
    console.log(`  null         ${nullCount}`);
    console.log(`  missing      ${missingCount}`);

    // string 값 중 중복 여부 확인 (새 인덱스 생성 시 충돌 방지)
    const dupes = await users
      .aggregate<{ _id: string; count: number }>([
        { $match: { discordId: { $type: "string" } } },
        { $group: { _id: "$discordId", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();
    if (dupes.length > 0) {
      console.error(
        `\n[오류] discordId 값이 중복된 string 이 ${dupes.length}건 있음:`,
      );
      for (const d of dupes) {
        console.error(`  ${d._id} (${d.count}회)`);
      }
      console.error("  새 unique 인덱스 생성 불가. 중복 데이터 먼저 정리하세요.");
      process.exit(1);
    }

    // 3. 기존 sparse 인덱스 drop
    console.log(`\n[3/4] 기존 인덱스 drop: ${OLD_INDEX_NAME}`);
    const hasOld = existing.some((idx) => idx.name === OLD_INDEX_NAME);
    if (!hasOld) {
      console.log(`  skip (${OLD_INDEX_NAME} 인덱스 없음)`);
    } else if (isDryRun) {
      console.log(`  [dry-run] dropIndex(${OLD_INDEX_NAME}) would run`);
    } else {
      await users.dropIndex(OLD_INDEX_NAME);
      console.log(`  dropped: ${OLD_INDEX_NAME}`);
    }

    // 4. 새 partial 인덱스 생성
    console.log(`\n[4/4] 새 인덱스 생성: ${NEW_INDEX_NAME}`);
    const hasNew = existing.some((idx) => idx.name === NEW_INDEX_NAME);
    if (hasNew) {
      console.log(`  skip (${NEW_INDEX_NAME} 이미 존재)`);
    } else if (isDryRun) {
      console.log(
        `  [dry-run] createIndex({ discordId: 1 }, ` +
          `{ unique: true, partialFilterExpression: { discordId: { $type: "string" } } }) would run`,
      );
    } else {
      await users.createIndex(
        { discordId: 1 },
        {
          name: NEW_INDEX_NAME,
          unique: true,
          partialFilterExpression: { discordId: { $type: "string" } },
        },
      );
      console.log(`  created: ${NEW_INDEX_NAME}`);
    }

    console.log("\n" + "=".repeat(70));
    if (isDryRun) {
      console.log("DRY-RUN 완료. 실제 적용은 --execute --yes 플래그로 실행.");
    } else {
      console.log("EXECUTE 완료.");
      console.log("");
      console.log("롤백 (mongo shell 에서 실행):");
      console.log(`  db.users.dropIndex("${NEW_INDEX_NAME}");`);
      console.log(
        `  db.users.createIndex({ discordId: 1 }, { name: "${OLD_INDEX_NAME}", unique: true, sparse: true });`,
      );
    }
    console.log("=".repeat(70));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("[치명적 오류]", err);
  process.exit(1);
});
