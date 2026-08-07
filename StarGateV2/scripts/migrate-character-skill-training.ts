/**
 * characters.play.skillTraining의 레거시 철학 표기를 문학으로 통합한다.
 *
 * 2026-08-07 운영 이관을 완료했다. 현재 스크립트는 잔여 레거시 표기 진단만
 * 허용하며, 새로 발견된 대상은 별도 검토·승인된 migration으로 처리한다.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     scripts/migrate-character-skill-training.ts
 * `문학`과 `철학`은 같은 기술 훈련 항목이므로 둘이 함께 존재하더라도
 * `문학` 하나만 남기고 중복을 제거한다.
 */

import { MongoClient, type ObjectId } from "mongodb";

import { normalizeSkillTraining } from "../lib/character/skill-training.ts";

export type SkillTrainingMigrationPlan =
  | {
      status: "unchanged" | "update";
      original: string[];
      normalized: string[];
    }
  | {
      status: "invalid_skill_training";
      original: unknown;
    };

export interface MigrationMode {
  execute: false;
  dryRun: true;
}

interface CharacterSkillTrainingDocument {
  _id: ObjectId;
  codename?: string;
  type?: string;
  play?: {
    skillTraining?: unknown;
  };
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function parseMigrationMode(args: readonly string[]): MigrationMode {
  if (args.includes("--execute")) {
    throw new Error(
      "운영 문학·철학 migration은 완료되어 직접 실행 경로가 폐쇄되었습니다.",
    );
  }

  return { execute: false, dryRun: true };
}

export function planSkillTrainingMigration(
  input: unknown,
): SkillTrainingMigrationPlan {
  if (!Array.isArray(input) || input.some((value) => typeof value !== "string")) {
    return { status: "invalid_skill_training", original: input };
  }

  const original = [...input] as string[];
  const normalized = normalizeSkillTraining(original);
  return {
    status: arraysEqual(original, normalized) ? "unchanged" : "update",
    original,
    normalized,
  };
}

async function main(): Promise<void> {
  parseMigrationMode(process.argv.slice(2));
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI 환경변수가 필요합니다.");
  }

  const dbName = process.env.DB_NAME?.trim() || "stargate";
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const characters = client
      .db(dbName)
      .collection<CharacterSkillTrainingDocument>("characters");
    const documents = await characters
      .find(
        { type: "AGENT", "play.skillTraining": { $exists: true } },
        { projection: { codename: 1, type: 1, "play.skillTraining": 1 } },
      )
      .toArray();

    const counts = {
      update: 0,
      unchanged: 0,
      invalid_skill_training: 0,
    };

    console.log(
      `[skill-training] mode=DRY-RUN candidates=${documents.length}`,
    );

    for (const document of documents) {
      const plan = planSkillTrainingMigration(document.play?.skillTraining);
      counts[plan.status] += 1;
      const target = `${document.codename ?? "(codename 없음)"} (${document._id.toString()})`;

      if (plan.status === "invalid_skill_training") {
        console.warn(
          `[skill-training] invalid_skill_training target=${target}`,
        );
        continue;
      }
      if (plan.status === "unchanged") continue;

      console.log(
        `[skill-training] would-update target=${target} from=${JSON.stringify(plan.original)} to=${JSON.stringify(plan.normalized)}`,
      );
    }

    console.log(`[skill-training] summary=${JSON.stringify(counts)}`);
    console.log(
      "[skill-training] 진단 완료. 운영 이관 완료 후 직접 실행 경로는 폐쇄되었습니다.",
    );
  } finally {
    await client.close();
  }
}

const isMainEntry = (process.argv[1] ?? "").endsWith(
  "migrate-character-skill-training.ts",
);

if (isMainEntry) {
  main().catch((error) => {
    console.error("[skill-training] fatal", error);
    process.exitCode = 1;
  });
}
