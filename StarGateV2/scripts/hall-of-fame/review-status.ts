/** Read-only coverage/status audit for the stargate-lore operation-honor plan. */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildOperationHonorRecords,
  reduceOperationHonorSource,
} from "@stargate/core";
import {
  close,
  connect,
  findHonorCandidateCharactersByCodenames,
  HONOR_LORE_REVIEW_REVISION,
  honorAnalysisStatesCol,
  honorRecordsCol,
  sessionReportVisibilityFilter,
  sessionReportsCol,
  type HonorRecord,
  type UpsertHonorRecordInput,
} from "@stargate/shared-db";

import {
  buildManualReviewContentHash,
  parseManualOperationHonorReviewPlan,
  validateManualReviewItems,
} from "./manual-review.ts";
import { buildSkippedOperationSourceFingerprint } from "./manifest.ts";
import { sameLogicalSourceSet } from "./backfill.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");
const defaultReviewPath = resolve(
  __dirname,
  "operation-honors-manual-review.v1.json",
);

type ReviewCoverageStatus =
  | "CURRENT"
  | "REVIEW_REQUIRED"
  | "SOURCE_CHANGED"
  | "LEDGER_DRIFT"
  | "READY_TO_APPLY";

interface CliOptions {
  reviewPath: string;
  help: boolean;
}

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    (quote === `"` || quote === `'`) &&
    trimmed.endsWith(quote) &&
    trimmed.length >= 2
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

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
    process.env[key] ??= normalizeEnvValue(trimmed.slice(separator + 1));
  }
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = args.filter((value) => value !== "--");
  let reviewPath = defaultReviewPath;
  let help = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (value === "--help" || value === "-h") help = true;
    else if (value === "--review") {
      const next = values[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--review 뒤에 경로가 필요합니다.");
      }
      reviewPath = resolve(next);
      index += 1;
    } else {
      throw new Error(`알 수 없는 인자입니다: ${value}`);
    }
  }
  return { reviewPath, help };
}

function usage(): string {
  return [
    "사용법:",
    "  pnpm hall-of-fame:review-status",
    "  pnpm hall-of-fame:review-status -- --review <path>",
    "",
    "현재 U 보고서와 lore 검토 계획·공적 원장을 비교합니다.",
    "DB, 알림, 웹훅을 변경하지 않습니다.",
  ].join("\n");
}

export function resolveReviewStatusDatabaseName(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const web = env.DB_NAME?.trim();
  const worker = env.MONGODB_DB_NAME?.trim();
  if (web && worker && web !== worker) {
    throw new Error("DB_NAME과 MONGODB_DB_NAME이 일치해야 합니다.");
  }
  return web || worker || "stargate";
}

export function operationHonorLedgerMatches(
  actual: readonly HonorRecord[],
  expected: readonly UpsertHonorRecordInput[],
): boolean {
  return sameLogicalSourceSet(actual, expected);
}

export async function main(rawArgs = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(rawArgs);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  loadEnvFile(resolve(projectRoot, ".env.local"));
  loadEnvFile(resolve(projectRoot, ".env"));
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");
  const database = resolveReviewStatusDatabaseName();
  const plan = parseManualOperationHonorReviewPlan(
    JSON.parse(await readFile(options.reviewPath, "utf8")),
  );
  const reviewedBySource = new Map(
    plan.reviewedSources.map((source) => [source.sourceKey, source]),
  );
  const plannedAwardsBySource = new Map<string, number>();
  const plannedItemsBySource = new Map<
    string,
    (typeof plan.items)[number][]
  >();
  for (const item of plan.items) {
    plannedAwardsBySource.set(
      item.sourceKey,
      (plannedAwardsBySource.get(item.sourceKey) ?? 0) + 1,
    );
    const items = plannedItemsBySource.get(item.sourceKey) ?? [];
    items.push(item);
    plannedItemsBySource.set(item.sourceKey, items);
  }

  await connect({ uri, dbName: database, maxPoolSize: 3 });
  try {
    const reports = await (await sessionReportsCol())
      .find(sessionReportVisibilityFilter("U"))
      .sort({ sessionId: 1 })
      .toArray();
    const states = await (await honorAnalysisStatesCol())
      .find({ sourceType: "SESSION_REPORT" })
      .toArray();
    const stateBySource = new Map(states.map((state) => [state.sourceKey, state]));
    const activeRecords = await (await honorRecordsCol())
      .find({
        domain: "OPERATION",
        status: "ACTIVE",
        "source.type": "SESSION_REPORT",
      })
      .toArray();
    const activeRecordsBySource = new Map<string, HonorRecord[]>();
    for (const record of activeRecords) {
      const records = activeRecordsBySource.get(record.source.key) ?? [];
      records.push(record);
      activeRecordsBySource.set(record.source.key, records);
    }
    const rows: Array<{
      sourceKey: string;
      status: ReviewCoverageStatus;
      plannedOutcome: "AWARDED" | "NO_AWARD" | null;
      plannedAwards: number;
      activeAwards: number;
      reviewState: string | null;
      currentContentHash: string;
    }> = [];

    for (const report of reports) {
      const reviewed = reviewedBySource.get(report.sessionId);
      const currentContentHash = buildManualReviewContentHash(report);
      const plannedAwards = plannedAwardsBySource.get(report.sessionId) ?? 0;
      const characters = await findHonorCandidateCharactersByCodenames(
        report.relatedPersonnelCodenames ?? [],
      );
      const source = reduceOperationHonorSource({ report, characters });
      const expectedSourceHash = source?.sourceHash ??
        buildSkippedOperationSourceFingerprint({ report, characters });
      const state = stateBySource.get(report.sessionId);
      const currentRecords = activeRecordsBySource.get(report.sessionId) ?? [];
      const plannedItems = plannedItemsBySource.get(report.sessionId) ?? [];
      const expectedRecords = source
        ? buildOperationHonorRecords({
            source,
            honors: validateManualReviewItems({
              source,
              items: plannedItems,
            }),
            analyzerRevision: HONOR_LORE_REVIEW_REVISION,
            issuedAt: new Date(0),
          })
        : [];
      const activeAwards = currentRecords.length;
      const ledgerMatches = source
        ? operationHonorLedgerMatches(currentRecords, expectedRecords)
        : plannedItems.length === 0 && currentRecords.length === 0;
      let status: ReviewCoverageStatus;
      if (!reviewed) status = "REVIEW_REQUIRED";
      else if (reviewed.contentHash !== currentContentHash) {
        status = "SOURCE_CHANGED";
      } else if (!ledgerMatches) {
        status = "LEDGER_DRIFT";
      } else {
        const expectedState = source ? "SUCCEEDED" : "SKIPPED";
        const applied =
          state?.sourceRecordId === String(report._id) &&
          state.sourceHash === expectedSourceHash &&
          state.analyzerRevision === HONOR_LORE_REVIEW_REVISION &&
          state.status === expectedState &&
          activeAwards === plannedAwards;
        status = applied ? "CURRENT" : "READY_TO_APPLY";
      }
      rows.push({
        sourceKey: report.sessionId,
        status,
        plannedOutcome: reviewed?.outcome ?? null,
        plannedAwards,
        activeAwards,
        reviewState: state?.status ?? null,
        currentContentHash,
      });
    }

    const currentKeys = new Set(reports.map((report) => report.sessionId));
    const orphanedReviews = plan.reviewedSources
      .map((source) => source.sourceKey)
      .filter((sourceKey) => !currentKeys.has(sourceKey))
      .sort();
    const summary = rows.reduce<Record<ReviewCoverageStatus, number>>(
      (counts, row) => {
        counts[row.status] += 1;
        return counts;
      },
      {
        CURRENT: 0,
        REVIEW_REQUIRED: 0,
        SOURCE_CHANGED: 0,
        LEDGER_DRIFT: 0,
        READY_TO_APPLY: 0,
      },
    );
    const orphanedActiveSources = [...activeRecordsBySource]
      .filter(([sourceKey]) => !currentKeys.has(sourceKey))
      .map(([sourceKey, records]) => ({
        sourceKey,
        activeAwards: records.length,
      }))
      .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
    const actionRequired = rows.filter((row) => row.status !== "CURRENT");
    console.log(
      JSON.stringify(
        {
          mode: "read-only-lore-review-status",
          database,
          analyzerRevision: HONOR_LORE_REVIEW_REVISION,
          reportCoverage: reports.length,
          awardedSources: plan.reviewedSources.filter(
            (source) => source.outcome === "AWARDED",
          ).length,
          noAwardSources: plan.reviewedSources.filter(
            (source) => source.outcome === "NO_AWARD",
          ).length,
          plannedAwards: plan.items.length,
          activeAwards: activeRecords.length,
          summary,
          orphanedReviews,
          orphanedActiveSources,
          actionRequired,
          healthy:
            actionRequired.length === 0 &&
            orphanedReviews.length === 0 &&
            orphanedActiveSources.length === 0,
          databaseWrites: 0,
          notificationsCreated: 0,
          webhooksSent: 0,
        },
        null,
        2,
      ),
    );
    return 0;
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
      `[hall-of-fame-review-status] ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    );
    process.exitCode = 1;
  });
}
