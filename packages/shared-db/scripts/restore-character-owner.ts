/**
 * 1회성 — 캐릭터 owner 복원 스크립트.
 *
 * 사용 케이스: 잘못 다른 user에게 할당된 캐릭터의 ownerId를 직전 owner로 되돌린다.
 * character_change_logs 의 가장 최근 ownerId 변경 entry 의 `before` 값을 사용.
 *
 * Usage:
 *   pnpm --filter @stargate/shared-db exec tsx scripts/restore-character-owner.ts \
 *     --codename="우디 대형마법" \
 *     --dry-run
 *
 *   pnpm --filter @stargate/shared-db exec tsx scripts/restore-character-owner.ts \
 *     --codename="우디 대형마법" \
 *     --execute --yes
 *
 * Options:
 *   --codename=<str>       캐릭터 codename (정확히 일치) 또는 lore.name 부분 일치 fallback
 *   --target-owner=<id>    명시적 owner _id hex 지정 (change-logs 무시)
 *   --dry-run              기본. 변경 없이 현재 vs 이전 owner 만 출력
 *   --execute --yes        실제 update + 새 change-log entry 기록
 *   --mongodb-uri=<uri>    환경변수 override (선택)
 */

import { ObjectId } from "mongodb";
import {
  connect,
  close,
  characterChangeLogsCol,
  insertChangeLog,
} from "../src/index.js";
import { charactersCol, usersCol } from "../src/collections.js";

interface CliArgs {
  codename: string;
  targetOwner?: string;
  dryRun: boolean;
  execute: boolean;
  yes: boolean;
  mongodbUri?: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const get = (k: string): string | undefined => {
    const arg = argv.find((a) => a.startsWith(`--${k}=`));
    return arg ? arg.slice(k.length + 3) : undefined;
  };
  const has = (k: string): boolean => argv.includes(`--${k}`);

  if (has("help")) {
    console.log(
      "Usage: tsx scripts/restore-character-owner.ts --codename=<str> [--target-owner=<hex>] [--dry-run|--execute --yes]",
    );
    process.exit(0);
  }

  const codename = get("codename");
  if (!codename) {
    console.error("--codename 필수");
    process.exit(1);
  }

  const targetOwner = get("target-owner");
  const execute = has("execute");
  const yes = has("yes");
  const dryRun = has("dry-run") || (!execute && !has("verify-only"));

  if (execute && !yes) {
    console.error("--execute 는 --yes 와 함께 사용 필요");
    process.exit(1);
  }

  return {
    codename,
    targetOwner,
    dryRun,
    execute,
    yes,
    mongodbUri: get("mongodb-uri") ?? process.env.MONGODB_URI,
  };
}

function maskUri(uri: string): string {
  return uri.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1***$2");
}

async function describeUser(userIdHex: string | null | undefined): Promise<string> {
  if (!userIdHex) return "(null)";
  if (!ObjectId.isValid(userIdHex)) return `(invalid hex: ${userIdHex})`;
  const col = await usersCol();
  const u = await col.findOne({ _id: new ObjectId(userIdHex) });
  if (!u) return `(missing user: ${userIdHex})`;
  const name =
    u.discordGlobalName ?? u.discordUsername ?? u.displayName ?? u.username ?? "?";
  return `${name} [${u.username}] (${userIdHex})`;
}

async function main() {
  const args = parseArgs();

  if (!args.mongodbUri) {
    console.error("MONGODB_URI 환경변수 또는 --mongodb-uri 필요");
    process.exit(1);
  }

  console.log("=== 캐릭터 owner 복원 ===");
  console.log(`Codename: ${args.codename}`);
  console.log(`Mode: ${args.dryRun ? "DRY-RUN" : "EXECUTE"}`);
  console.log(`Mongo: ${maskUri(args.mongodbUri)}`);
  console.log();

  await connect({ uri: args.mongodbUri, dbName: "stargate" });

  try {
    const col = await charactersCol();
    // 1. 캐릭터 검색 (codename 정확 일치 → 없으면 lore.name 부분 일치)
    let character = await col.findOne({ codename: args.codename });
    if (!character) {
      character = await col.findOne({
        "lore.name": { $regex: args.codename.split(/\s+/).join(".*"), $options: "i" },
      });
    }
    if (!character) {
      console.error(`캐릭터 없음: ${args.codename}`);
      process.exit(1);
    }

    console.log("[1/4] 캐릭터 식별됨");
    console.log(`  _id: ${character._id}`);
    console.log(`  codename: ${character.codename}`);
    console.log(`  type: ${character.type}, tier: ${character.tier ?? "(undefined → MAIN)"}`);
    console.log(`  현재 owner: ${await describeUser(character.ownerId)}`);
    console.log();

    // 2. 새 owner 결정
    let newOwnerId: string | null = null;
    if (args.targetOwner) {
      newOwnerId = args.targetOwner;
      console.log("[2/4] 명시 target-owner 사용");
    } else {
      // change_logs 에서 가장 최근 ownerId 변경 찾기
      const logsCol = await characterChangeLogsCol();
      const latestOwnerChange = await logsCol.findOne(
        { characterId: character._id, "changes.field": "ownerId" },
        { sort: { createdAt: -1 } },
      );
      if (!latestOwnerChange) {
        console.error("[2/4] change_logs 에 ownerId 변경 기록 없음 — --target-owner 명시 필요");
        process.exit(1);
      }
      const ownerEntry = latestOwnerChange.changes.find((c) => c.field === "ownerId");
      const beforeValue = ownerEntry?.before;
      if (typeof beforeValue !== "string" || !ObjectId.isValid(beforeValue)) {
        console.error(`[2/4] ownerId 직전 값 무효: ${JSON.stringify(beforeValue)}`);
        process.exit(1);
      }
      newOwnerId = beforeValue;
      console.log("[2/4] change_logs 에서 직전 owner 발견");
      console.log(`  변경 시각: ${latestOwnerChange.createdAt.toISOString()}`);
      console.log(`  actor: ${latestOwnerChange.actorId} (${latestOwnerChange.source})`);
      console.log(`  before → after: ${JSON.stringify(beforeValue)} → ${JSON.stringify(ownerEntry?.after)}`);
    }
    console.log(`  복원 대상 owner: ${await describeUser(newOwnerId)}`);
    console.log();

    if (newOwnerId === character.ownerId) {
      console.log("[3/4] 현재 owner 와 복원 대상 동일 — 변경 불필요");
      return;
    }

    if (args.dryRun) {
      console.log("[3/4] DRY-RUN — 변경 없음");
      console.log(`  current ownerId: ${character.ownerId}`);
      console.log(`  → restore ownerId: ${newOwnerId}`);
      console.log("[4/4] --execute --yes 로 실제 적용");
      return;
    }

    // 3. update 실행
    const previousOwnerId = character.ownerId;
    const result = await col.updateOne(
      { _id: character._id },
      { $set: { ownerId: newOwnerId, updatedAt: new Date() } },
    );
    console.log("[3/4] characters.updateOne 적용");
    console.log(`  matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);

    // 4. change-log 기록
    await insertChangeLog({
      characterId: character._id,
      actorId: "000000000000000000000001", // sentinel — 1회성 스크립트
      actorRole: "GM",
      actorIsOwner: false,
      source: "admin",
      changes: [
        {
          field: "ownerId",
          before: previousOwnerId,
          after: newOwnerId,
        },
      ],
      reason: `restore-character-owner.ts: ${args.codename} 잘못된 할당 복원`,
    });
    console.log("[4/4] character_change_logs 기록 완료");
    console.log();
    console.log("=== 복원 완료 ===");
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
