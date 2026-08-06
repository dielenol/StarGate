/**
 * characters.play.skillTraining의 레거시 철학 표기를 문학으로 통합한다.
 *
 * 기본은 읽기 전용 dry-run이다. 실제 쓰기는 두 플래그를 모두 요구한다.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     scripts/migrate-character-skill-training.ts
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     scripts/migrate-character-skill-training.ts --execute --yes
 *
 * `문학`과 `철학`이 별도 토큰으로 함께 존재하면 어느 값을 우선하거나 합칠지
 * 추정하지 않고 manual_resolution_required로 보고한 뒤 변경하지 않는다.
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
      status: "manual_resolution_required";
      original: string[];
      reason: "literature_and_philosophy_conflict";
    }
  | {
      status: "invalid_skill_training";
      original: unknown;
    };

export interface MigrationMode {
  execute: boolean;
  dryRun: boolean;
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
  const execute = args.includes("--execute");
  const confirmed = args.includes("--yes");

  if (execute && !confirmed) {
    throw new Error("--execute는 --yes와 함께 사용해야 합니다.");
  }

  return { execute: execute && confirmed, dryRun: !(execute && confirmed) };
}

export function planSkillTrainingMigration(
  input: unknown,
): SkillTrainingMigrationPlan {
  if (!Array.isArray(input) || input.some((value) => typeof value !== "string")) {
    return { status: "invalid_skill_training", original: input };
  }

  const original = [...input] as string[];
  if (original.includes("문학") && original.includes("철학")) {
    return {
      status: "manual_resolution_required",
      original,
      reason: "literature_and_philosophy_conflict",
    };
  }

  const normalized = normalizeSkillTraining(original);
  return {
    status: arraysEqual(original, normalized) ? "unchanged" : "update",
    original,
    normalized,
  };
}

async function main(): Promise<void> {
  const mode = parseMigrationMode(process.argv.slice(2));
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
      manual_resolution_required: 0,
      invalid_skill_training: 0,
    };

    console.log(
      `[skill-training] mode=${mode.dryRun ? "DRY-RUN" : "EXECUTE"} candidates=${documents.length}`,
    );

    for (const document of documents) {
      const plan = planSkillTrainingMigration(document.play?.skillTraining);
      counts[plan.status] += 1;
      const target = `${document.codename ?? "(codename 없음)"} (${document._id.toString()})`;

      if (plan.status === "manual_resolution_required") {
        console.warn(
          `[skill-training] manual_resolution_required target=${target} values=${JSON.stringify(plan.original)}`,
        );
        continue;
      }
      if (plan.status === "invalid_skill_training") {
        console.warn(
          `[skill-training] invalid_skill_training target=${target}`,
        );
        continue;
      }
      if (plan.status === "unchanged") continue;

      console.log(
        `[skill-training] ${mode.dryRun ? "would-update" : "update"} target=${target} from=${JSON.stringify(plan.original)} to=${JSON.stringify(plan.normalized)}`,
      );
      if (mode.dryRun) continue;

      const result = await characters.updateOne(
        {
          _id: document._id,
          "play.skillTraining": plan.original,
        },
        {
          $set: {
            "play.skillTraining": plan.normalized,
            updatedAt: new Date(),
          },
        },
      );
      if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
        throw new Error(
          `동시 변경 또는 쓰기 실패로 중단: ${target} matched=${result.matchedCount} modified=${result.modifiedCount}`,
        );
      }

      const written = await characters.findOne(
        { _id: document._id },
        { projection: { "play.skillTraining": 1 } },
      );
      const verified = planSkillTrainingMigration(written?.play?.skillTraining);
      if (
        verified.status !== "unchanged" ||
        !arraysEqual(verified.original, plan.normalized)
      ) {
        throw new Error(`쓰기 후 재조회 검증 실패: ${target}`);
      }
    }

    console.log(`[skill-training] summary=${JSON.stringify(counts)}`);
    if (mode.dryRun) {
      console.log(
        "[skill-training] dry-run 완료. 실제 적용에는 --execute --yes가 모두 필요합니다.",
      );
    }
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
