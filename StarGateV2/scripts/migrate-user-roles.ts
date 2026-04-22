/**
 * Phase 2-A 사용자 역할 마이그레이션 스크립트
 *
 * 구 5단 역할(SUPER_ADMIN/ADMIN/GM/PLAYER/GUEST)을
 * 신 8단 역할(GM/V/A/M/H/G/J/U)로 일괄 전환하고
 * 레거시 `securityClearance` 필드를 제거한다.
 *
 * 매핑:
 *   SUPER_ADMIN → GM
 *   ADMIN       → GM
 *   GM          → V
 *   PLAYER      → G
 *   GUEST       → U
 *
 * 사용법:
 *   # dry-run (기본, DB 쓰기 없음)
 *   npx tsx scripts/migrate-user-roles.ts
 *
 *   # 실제 실행 (두 플래그 모두 필요)
 *   npx tsx scripts/migrate-user-roles.ts --execute --yes
 *
 * 멱등성:
 *   신 역할 값(GM/V/A/M/H/G/J/U)을 이미 보유한 문서는 필터에서 자연 배제.
 *   재실행해도 안전하다.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { MongoClient } from "mongodb";

// .env.local 수동 로드 (seed-admin.ts 패턴 재사용)
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

interface RoleMapping {
  from: string;
  to: string;
}

const ROLE_MAPPINGS: readonly RoleMapping[] = [
  { from: "SUPER_ADMIN", to: "GM" },
  { from: "ADMIN", to: "GM" },
  { from: "GM", to: "V" },
  { from: "PLAYER", to: "G" },
  { from: "GUEST", to: "U" },
] as const;

async function main() {
  // CLI 플래그 파싱
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
    `Phase 2-A 사용자 역할 마이그레이션 (${isDryRun ? "DRY-RUN" : "EXECUTE"})`,
  );
  console.log("=".repeat(70));

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const users = db.collection("users");

    // 1. 현재 role 분포
    console.log("\n[1/4] 현재 role 분포");
    const distribution = await users
      .aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$role", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    if (distribution.length === 0) {
      console.log("  (users 컬렉션이 비어 있음)");
    } else {
      for (const row of distribution) {
        console.log(`  ${String(row._id ?? "(null)").padEnd(16)} ${row.count}`);
      }
    }

    // 2. 백업 (execute 모드에서만)
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `users_backup_${ts}`;

    if (isDryRun) {
      console.log("\n[2/4] 백업");
      console.log(`  [dry-run] 실행 시 생성될 백업: ${backupName}`);
    } else {
      console.log(`\n[2/4] 백업 생성 → ${backupName}`);
      await users
        .aggregate([{ $match: {} }, { $out: backupName }])
        .toArray();
      const backupCount = await db.collection(backupName).countDocuments();
      console.log(`  백업 완료 (${backupCount} 문서)`);
    }

    // 3. role updateMany (5회)
    console.log("\n[3/4] 역할 전환");
    for (const { from, to } of ROLE_MAPPINGS) {
      const filter = { role: from };
      if (isDryRun) {
        const count = await users.countDocuments(filter);
        console.log(
          `  [dry-run] ${from.padEnd(12)} → ${to.padEnd(2)}  would change ${count} documents`,
        );
      } else {
        const result = await users.updateMany(filter, {
          $set: { role: to, updatedAt: new Date() },
        });
        console.log(
          `  ${from.padEnd(12)} → ${to.padEnd(2)}  matched=${result.matchedCount} modified=${result.modifiedCount}`,
        );
      }
    }

    // 4. securityClearance 필드 제거
    console.log("\n[4/4] securityClearance 필드 제거");
    const clearanceFilter = { securityClearance: { $exists: true } };
    if (isDryRun) {
      const count = await users.countDocuments(clearanceFilter);
      console.log(
        `  [dry-run] $unset securityClearance  would change ${count} documents`,
      );
    } else {
      const result = await users.updateMany(clearanceFilter, {
        $unset: { securityClearance: "" },
      });
      console.log(
        `  $unset securityClearance  matched=${result.matchedCount} modified=${result.modifiedCount}`,
      );
    }

    // 완료 메시지 + 롤백 안내
    console.log("\n" + "=".repeat(70));
    if (isDryRun) {
      console.log("DRY-RUN 완료. 실제 적용은 --execute --yes 플래그로 실행.");
    } else {
      console.log("EXECUTE 완료.");
      console.log("");
      console.log("롤백 (mongo shell 에서 실행):");
      console.log(`  db.users.drop();`);
      console.log(
        `  db.${backupName}.aggregate([{ $out: "users" }]);`,
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
