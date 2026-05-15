/**
 * 일회성: GM 더미 캐릭터의 agentLevel 을 "GM" 으로 승격 (2026-05-14)
 *
 * - 대상: codename === "GM" 인 캐릭터 (테스트용 더미).
 * - 변경: agentLevel = "GM" + updatedAt + bulkUpdatedAt 갱신.
 * - shared-db AGENT_LEVELS 는 GM 제외 7단(V~U)이지만 AgentLevel 타입 자체는
 *   RoleLevel(GM 포함 8단)과 alias 이므로 DB 적재는 허용된다 (운영 정책상 GM 은 user.role 전용,
 *   character.agentLevel 에는 부여하지 않는 것이 원칙. 본 케이스는 테스트용 예외).
 *
 * 사용법:
 *   node --experimental-strip-types scripts/_oneoff-promote-gm-dummy-2026-05-14.mjs               # dry-run
 *   node --experimental-strip-types scripts/_oneoff-promote-gm-dummy-2026-05-14.mjs --execute --yes  # 적용
 *
 * 실행 후 본 파일 즉시 삭제.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { MongoClient } from "mongodb";

/* ── .env.local 로드 ── */
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
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  /* .env.local 부재 — execute 는 아래에서 거부 */
}

/* ── CLI ── */
const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const DRY_RUN = !EXECUTE;

if (EXECUTE && !YES) {
  console.error("[promote-gm-dummy] --execute 시 --yes 명시 필요.");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";
if (!MONGODB_URI) {
  console.error("[promote-gm-dummy] MONGODB_URI 미설정.");
  process.exit(1);
}

console.log(
  `[promote-gm-dummy] ${DRY_RUN ? "DRY-RUN" : "EXECUTE"} mode | db=${DB_NAME}`,
);

const client = new MongoClient(MONGODB_URI);
let exitCode = 0;
try {
  await client.connect();
  const db = client.db(DB_NAME);

  /* codename === "GM" 인 캐릭터 점검. 다수일 수 있으므로 모두 출력. */
  const targets = await db
    .collection("characters")
    .find(
      { codename: "GM" },
      { projection: { _id: 1, codename: 1, agentLevel: 1, type: 1 } },
    )
    .toArray();

  if (targets.length === 0) {
    console.log("[promote-gm-dummy] codename === 'GM' 인 캐릭터 없음 — 작업 없음.");
  } else {
    console.log(`[promote-gm-dummy] 대상 ${targets.length}건:`);
    for (const c of targets) {
      console.log(
        `  - _id=${String(c._id)} | codename=${c.codename} | type=${c.type ?? "-"} | agentLevel=${c.agentLevel ?? "(empty)"} → GM`,
      );
    }

    if (!DRY_RUN) {
      const now = new Date();
      const res = await db.collection("characters").updateMany(
        { codename: "GM" },
        {
          $set: {
            agentLevel: "GM",
            updatedAt: now,
            bulkUpdatedAt: now,
          },
        },
      );
      console.log(
        `[promote-gm-dummy] update 결과: matched=${res.matchedCount}, modified=${res.modifiedCount}`,
      );
    } else {
      console.log("[promote-gm-dummy] (dry-run) update 생략");
    }
  }

  console.log(`[promote-gm-dummy] ${DRY_RUN ? "DRY-RUN 완료" : "완료"}.`);
} catch (err) {
  console.error("[promote-gm-dummy] 에러:", err);
  exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
process.exit(exitCode);
