import "dotenv/config";

import { pathToFileURL } from "node:url";

import { SharedDbConnectionAdapter } from "../adapters/shared-db-connection.js";
import { loadWorkerMongoConfig } from "../config.js";
import { logger } from "../logger.js";
import { verifyDiscordWebhookMessageOwnership } from "../outbox/discord-client.js";
import {
  buildMongoTargetFingerprint,
  ResearchRankingReconciliationError,
  reconcileResearchRankingDeliveryUnknown,
  type ResearchRankingReconciliationAction,
} from "../operations/research-ranking-reconciliation.js";

interface ReconciliationCliOptions {
  action: ResearchRankingReconciliationAction;
  candidateMessageId?: string;
  execute: boolean;
  expectedPlanDigest?: string;
  targetDb?: string;
  targetId?: string;
}

function optionValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1]?.trim() : undefined;
}

export function parseResearchRankingReconciliationArgs(
  argv: readonly string[],
): ReconciliationCliOptions {
  const action = optionValue(argv, "--action");
  if (action !== "adopt" && action !== "retry") {
    throw new ResearchRankingReconciliationError(
      "--action은 adopt 또는 retry여야 합니다.",
    );
  }

  const execute = argv.includes("--execute");
  const confirmed = argv.includes("--yes");
  const expectedPlanDigest = optionValue(argv, "--expected-plan");
  const targetDb = optionValue(argv, "--target-db");
  const targetId = optionValue(argv, "--target-id");
  const candidateMessageId = optionValue(argv, "--message-id");
  if (execute && !confirmed) {
    throw new ResearchRankingReconciliationError(
      "실행 모드는 --execute --yes를 함께 지정해야 합니다.",
    );
  }
  if (execute && (!targetDb || !targetId || !expectedPlanDigest)) {
    throw new ResearchRankingReconciliationError(
      "실행 모드는 --target-db, dry-run의 --target-id와 --expected-plan digest가 필요합니다.",
    );
  }
  if (
    targetId &&
    !/^mongo-target-v1:[a-f0-9]{64}$/.test(targetId)
  ) {
    throw new ResearchRankingReconciliationError(
      "--target-id는 dry-run이 출력한 MongoDB fingerprint여야 합니다.",
    );
  }
  if (
    expectedPlanDigest &&
    !/^[a-f0-9]{64}$/.test(expectedPlanDigest)
  ) {
    throw new ResearchRankingReconciliationError(
      "--expected-plan은 64자리 sha256 digest여야 합니다.",
    );
  }

  return {
    action,
    ...(candidateMessageId ? { candidateMessageId } : {}),
    execute,
    ...(expectedPlanDigest ? { expectedPlanDigest } : {}),
    ...(targetDb ? { targetDb } : {}),
    ...(targetId ? { targetId } : {}),
  };
}

export async function runResearchRankingReconciliationCli(
  argv: readonly string[],
): Promise<void> {
  const options = parseResearchRankingReconciliationArgs(argv);
  const mongo = loadWorkerMongoConfig();
  const targetFingerprint = buildMongoTargetFingerprint(mongo);
  if (options.execute && options.targetDb !== mongo.dbName) {
    throw new ResearchRankingReconciliationError(
      `--target-db가 현재 Mongo DB와 다릅니다: expected=${options.targetDb}, actual=${mongo.dbName}`,
    );
  }
  if (options.execute && options.targetId !== targetFingerprint) {
    throw new ResearchRankingReconciliationError(
      "--target-id가 현재 MongoDB 배포 대상 fingerprint와 다릅니다.",
    );
  }
  const researchWebhookUrl = process.env.DISCORD_WEBHOOK_RESEARCH_URL?.trim();
  if (options.action === "adopt" && !researchWebhookUrl) {
    throw new ResearchRankingReconciliationError(
      "adopt 후보 검증에는 DISCORD_WEBHOOK_RESEARCH_URL이 필요합니다.",
    );
  }

  const database = new SharedDbConnectionAdapter(mongo);
  await database.connect();
  try {
    await database.ping();
    const result = await reconcileResearchRankingDeliveryUnknown(
      {
        targetFingerprint,
        action: options.action,
        ...(options.candidateMessageId
          ? { candidateMessageId: options.candidateMessageId }
          : {}),
        execute: options.execute,
        ...(options.expectedPlanDigest
          ? { expectedPlanDigest: options.expectedPlanDigest }
          : {}),
      },
      {
        ...(researchWebhookUrl
          ? {
              verifyCandidateMessageOwnership: (messageId: string) =>
                verifyDiscordWebhookMessageOwnership(
                  researchWebhookUrl,
                  messageId,
                ),
            }
          : {}),
      },
    );
    logger.info("research_ranking_reconciliation_finished", {
      mode: result.status,
      targetDb: mongo.dbName,
      ...result.plan,
    });
    if (result.status === "planned") {
      logger.warn("research_ranking_reconciliation_write_skipped", {
        reason: "dry_run_default",
        executeCommand:
          "--execute --yes --target-db <DB> --target-id <FINGERPRINT> --expected-plan <DIGEST>",
      });
    }
  } finally {
    await database.close();
  }
}

const isMainEntry =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainEntry) {
  runResearchRankingReconciliationCli(process.argv.slice(2)).catch((error) => {
    logger.error("research_ranking_reconciliation_failed", error);
    process.exitCode = error instanceof ResearchRankingReconciliationError ? 64 : 1;
  });
}
