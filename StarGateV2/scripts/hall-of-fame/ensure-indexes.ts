/** Dedicated, approval-gated index rollout for the Hall of Fame ledger. */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  close,
  connect,
  ensureHonorIndexes,
  getDb,
  HONOR_INDEX_DEFINITIONS,
} from "@stargate/shared-db";
import type { IndexDescriptionInfo } from "mongodb";

import { inspectHonorIndexContract } from "./index-contract.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");

function loadEnvFile(path: string): void {
  let contents = "";
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    const quote = value[0];
    if (
      (quote === `"` || quote === `'`) &&
      value.endsWith(quote) &&
      value.length >= 2
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

async function currentIndexes(collection: string): Promise<IndexDescriptionInfo[]> {
  let indexes: IndexDescriptionInfo[] = [];
  try {
    indexes = await (await getDb()).collection(collection).listIndexes().toArray();
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? Number(error.code)
        : undefined;
    const codeName =
      error && typeof error === "object" && "codeName" in error
        ? String(error.codeName)
        : undefined;
    if (
      code !== 26 &&
      codeName !== "NamespaceNotFound" &&
      (!(error instanceof Error) ||
        !/ns does not exist|NamespaceNotFound/iu.test(error.message))
    ) {
      throw error;
    }
  }
  return indexes;
}

export async function main(rawArgs = process.argv.slice(2)): Promise<number> {
  const args = rawArgs.filter((value) => value !== "--");
  const execute = args.includes("--execute");
  const yes = args.includes("--yes");
  if (args.some((value) => value !== "--execute" && value !== "--yes")) {
    throw new Error("알 수 없는 인자입니다.");
  }
  if (execute !== yes) {
    throw new Error("인덱스 생성은 --execute --yes를 함께 사용해야 합니다.");
  }
  loadEnvFile(resolve(projectRoot, ".env.local"));
  loadEnvFile(resolve(projectRoot, ".env"));
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");
  const database =
    process.env.DB_NAME?.trim() ||
    process.env.MONGODB_DB_NAME?.trim() ||
    "stargate";
  if (
    process.env.DB_NAME?.trim() &&
    process.env.MONGODB_DB_NAME?.trim() &&
    process.env.DB_NAME.trim() !== process.env.MONGODB_DB_NAME.trim()
  ) {
    throw new Error("DB_NAME과 MONGODB_DB_NAME이 일치해야 합니다.");
  }
  if (execute && !process.env.DB_NAME?.trim() && !process.env.MONGODB_DB_NAME?.trim()) {
    throw new Error("실행 모드에는 DB_NAME 또는 MONGODB_DB_NAME이 필요합니다.");
  }
  await connect({ uri, dbName: database, maxPoolSize: 3 });
  try {
    const before: Record<string, { missing: string[]; conflicting: string[] }> = {};
    for (const [collection, definitions] of Object.entries(
      HONOR_INDEX_DEFINITIONS,
    )) {
      before[collection] = inspectHonorIndexContract(
        await currentIndexes(collection),
        definitions,
      );
    }
    const missingBefore = Object.values(before).reduce(
      (count, status) => count + status.missing.length,
      0,
    );
    const conflictingBefore = Object.values(before).reduce(
      (count, status) => count + status.conflicting.length,
      0,
    );
    if (conflictingBefore > 0) {
      throw new Error("HONOR_INDEX_DEFINITION_CONFLICT");
    }
    if (execute && missingBefore > 0) {
      await ensureHonorIndexes(await getDb());
    }
    const after: Record<string, { missing: string[]; conflicting: string[] }> = {};
    for (const [collection, definitions] of Object.entries(
      HONOR_INDEX_DEFINITIONS,
    )) {
      after[collection] = inspectHonorIndexContract(
        await currentIndexes(collection),
        definitions,
      );
    }
    const missingAfter = Object.values(after).reduce(
      (count, status) => count + status.missing.length,
      0,
    );
    const conflictingAfter = Object.values(after).reduce(
      (count, status) => count + status.conflicting.length,
      0,
    );
    console.log(
      JSON.stringify(
        {
          mode: execute ? "execute" : "dry-run",
          database,
          missingBefore,
          conflictingBefore,
          created: execute ? missingBefore - missingAfter : 0,
          missingAfter,
          conflictingAfter,
          plannedByCollection: before,
        },
        null,
        2,
      ),
    );
    return (missingAfter === 0 && conflictingAfter === 0) || !execute ? 0 : 2;
  } finally {
    await close();
  }
}

const directEntry = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directEntry) {
  void main().catch((error: unknown) => {
    console.error(
      `[hall-of-fame-indexes] ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    );
    process.exitCode = 1;
  });
}
