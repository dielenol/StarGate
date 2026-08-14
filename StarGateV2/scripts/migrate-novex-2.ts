/**
 * NOVEX 2.0 운영 전환 migration.
 *
 * 기본 동작은 읽기 전용 preflight다. 실제 반영은 라이브 운영 승인을 받은 뒤
 * 아래 네 값을 모두 명시해야 한다.
 *
 *   pnpm migrate:novex-2 -- \
 *     --apply --yes \
 *     --target-db <DB_NAME> \
 *     --expected-plan <DRY_RUN_PLAN_SHA256>
 *
 * TTL 제거, 적정가 backfill, 신규 index, 레거시 PENDING 공시 변환은
 * 원자적인 단일 MongoDB transaction이 될 수 없으므로 적용 전후 계획을 모두 출력한다.
 */

import {
  applyNovex2Migration,
  inspectNovex2Migration,
  novex2MigrationPlanFingerprint,
  type Novex2MigrationPlan,
} from "@stargate/shared-db";
import { MongoClient } from "mongodb";

function readArgument(argv: readonly string[], name: string): string | null {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim() || null;
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1]?.trim() || null : null;
}

function stablePlan(plan: Novex2MigrationPlan) {
  return {
    ttlIndexPresent: plan.ttlIndexPresent,
    ttlIndexNames: [...plan.ttlIndexNames].sort(),
    ttlIndexSpecs: [...plan.ttlIndexSpecs].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    pricesWithoutReferencePrice: plan.pricesWithoutReferencePrice,
    referencePriceBackfillSpecs: [...plan.referencePriceBackfillSpecs].sort(
      (left, right) => left.ticker.localeCompare(right.ticker),
    ),
    legacyPendingEvents: plan.legacyPendingEvents,
    legacyPendingEventsAlreadyConverted:
      plan.legacyPendingEventsAlreadyConverted,
    legacyPendingEventsToConvert: plan.legacyPendingEventsToConvert,
    indexSpecs: [...plan.indexSpecs]
      .map((spec) => ({
        collection: spec.collection,
        name: spec.name,
        action: spec.action,
        expected: spec.expected,
        ...(spec.actual ? { actual: spec.actual } : {}),
      }))
      .sort((left, right) =>
        `${left.collection}:${left.name}`.localeCompare(
          `${right.collection}:${right.name}`,
        ),
      ),
    uniqueIndexChecks: [...plan.uniqueIndexChecks].sort((left, right) =>
      `${left.collection}:${left.name}`.localeCompare(
        `${right.collection}:${right.name}`,
      ),
    ),
    legacyPendingEventSpecs: [...plan.legacyPendingEventSpecs].sort(
      (left, right) => left.id.localeCompare(right.id),
    ),
  };
}

function printPlan(label: string, plan: Novex2MigrationPlan): string {
  const fingerprint = novex2MigrationPlanFingerprint(plan);
  console.log(`[novex-2] ${label}`);
  console.log(
    JSON.stringify(
      {
        ...stablePlan(plan),
        planSha256: fingerprint,
      },
      null,
      2,
    ),
  );
  return fingerprint;
}

function assertCompleted(plan: Novex2MigrationPlan): void {
  const blockers = [
    plan.ttlIndexPresent ? "stock_price_history TTL 잔존" : null,
    plan.pricesWithoutReferencePrice > 0
      ? `referencePrice 미설정 ${plan.pricesWithoutReferencePrice}건`
      : null,
    plan.indexesToCreate.length > 0
      ? `미생성 index ${plan.indexesToCreate.length}개`
      : null,
    plan.legacyPendingEventsToConvert > 0
      ? `미변환 PENDING 이벤트 ${plan.legacyPendingEventsToConvert}건`
      : null,
    ...plan.uniqueIndexChecks
      .filter((check) => check.duplicateGroups > 0)
      .map(
        (check) =>
          `unique 중복 ${check.collection}.${check.name} ${check.duplicateGroups}그룹`,
      ),
  ].filter((item): item is string => item !== null);
  if (blockers.length > 0) {
    throw new Error(`적용 후 검증 실패: ${blockers.join(", ")}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const confirmed = argv.includes("--yes");
  const targetDb = readArgument(argv, "--target-db");
  const expectedPlan = readArgument(argv, "--expected-plan");
  const uri = process.env.MONGODB_URI;
  const configuredDb =
    process.env.MONGODB_DB_NAME?.trim() || process.env.DB_NAME?.trim() || null;

  if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");
  if (apply && (!confirmed || !targetDb || !expectedPlan)) {
    throw new Error(
      "WRITE에는 --apply --yes --target-db --expected-plan이 모두 필요합니다.",
    );
  }
  if (apply && configuredDb && configuredDb !== targetDb) {
    throw new Error(
      `환경 DB(${configuredDb})와 --target-db(${targetDb})가 달라 중단했습니다.`,
    );
  }

  const dbName = targetDb ?? configuredDb ?? "stargate";
  const client = new MongoClient(uri, { maxPoolSize: 2 });
  try {
    await client.connect();
    const db = client.db(dbName);
    const before = await inspectNovex2Migration(db);
    const fingerprint = printPlan(
      apply ? `APPLY 직전 상태 / target=${dbName}` : `DRY-RUN / target=${dbName}`,
      before,
    );

    if (!apply) {
      console.log(
        "[novex-2] 변경하지 않았습니다. 별도 승인 뒤 위 planSha256을 --expected-plan으로 전달해야 합니다.",
      );
      return;
    }
    if (fingerprint !== expectedPlan) {
      throw new Error(
        `승인 계획(${expectedPlan})과 실행 직전 계획(${fingerprint})이 달라 mutation 전에 중단했습니다.`,
      );
    }

    const result = await applyNovex2Migration(db, {
      expectedPlanFingerprint: expectedPlan,
    });
    console.log("[novex-2] 적용 결과");
    console.log(JSON.stringify(result, null, 2));
    const after = await inspectNovex2Migration(db);
    printPlan(`APPLY 이후 상태 / target=${dbName}`, after);
    assertCompleted(after);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(
    "[novex-2] 실패:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
