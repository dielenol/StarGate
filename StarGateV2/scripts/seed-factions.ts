/**
 * 세력(factions) 컬렉션 seed 스크립트
 *
 * `packages/shared-db/src/types/character.ts` 의 FACTIONS 상수를 DB로 승격한다.
 * upsertByCode 기반이라 여러 번 실행해도 idempotent.
 *
 * 사용법 (opt-in 쓰기 모드):
 *   pnpm run seed:factions                                # dry-run (기본, DB 읽기만)
 *   pnpm run seed:factions -- --dry-run -v                # + payload 전문 출력
 *   pnpm run seed:factions -- --execute --yes             # 실제 쓰기 (명시적 2-플래그)
 *   pnpm run seed:factions -- --execute --yes --verbose   # 실제 쓰기 + 전문 출력
 *
 * --execute 단독으로는 실행 거부 (--yes 누락 시 exit 1). seed-admin.ts 패턴 거울.
 *
 * 환경변수: MONGODB_URI (실행 시 필수, dry-run은 .env.local 부재면 계획만 출력)
 *
 * 실행 도구: `node --experimental-strip-types` (Node 22.6+, 안정적으로 24+).
 * tsx 4.21은 workspace ESM + exports 필드 조합에서 ERR_PACKAGE_PATH_NOT_EXPORTED로 실패하여
 * 2026-04-20 복귀 시도 후 다시 roll back했다. package.json의 engines.node 에서 22.6+ 명시.
 *
 * 주의 (2026-04-20 Cleanup 대기):
 *   Validator가 env override 버그 재현 과정에서 실제 DB에 MILITARY/COUNCIL/CIVIL 3건 insert됨.
 *   최초 실제 실행 전 아래 cleanup 쿼리로 제거 필요:
 *     db.factions.deleteMany({
 *       code: { $in: ['MILITARY','COUNCIL','CIVIL'] },
 *       createdAt: { $gte: ISODate('2026-04-20T14:55:00Z'), $lte: ISODate('2026-04-20T14:56:00Z') }
 *     })
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import {
  FACTIONS,
  ensureAllIndexes,
  getClient,
  getFactionByCode,
  initServerless,
  upsertFactionByCode,
  type CreateFactionInput,
} from "@stargate/shared-db";

/* ── 상수 ── */

/** seed 스크립트가 source 필드에 고정적으로 쓰는 값. DB 조회 시 "수동 시드 기원" 필터용. */
const SEED_SOURCE = "manual" as const;

/** FACTIONS 상수에 summary가 없으므로 한 줄 디폴트를 코드별로 고정. */
const FACTION_DEFAULT_SUMMARIES: Record<(typeof FACTIONS)[number]["code"], string> = {
  MILITARY: "노부스 오르도 군사 계열. 작전·무장 조직을 총괄한다.",
  COUNCIL: "노부스 오르도 세계이사회. 정책·행정·재무를 총괄한다.",
  CIVIL: "노부스 오르도와 연결된 민간 협력 계열. 상업·보급·외부 네트워크 축.",
};

/* ── .env.local 로드 ──
   `=== undefined` 로 빈 문자열("")을 unset 취급하지 않도록 방어.
   process.env 에 이미 정의된 값은 보존 (명시적 export > .env.local). */

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
  // .env.local 부재 — dry-run은 계속 진행, 실제 실행은 main() 안에서 분기
}

/* ── CLI 플래그 ──
   기본: dry-run. 실제 실행은 --execute + --yes 2개 모두 필요. */

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const DRY_RUN = !EXECUTE;
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

if (EXECUTE && !YES) {
  console.error(
    "[seed-factions] --execute 시 --yes 로 명시적 확인이 필요합니다.",
  );
  console.error(
    "  실제 쓰기: pnpm run seed:factions -- --execute --yes",
  );
  console.error("  dry-run 기본: pnpm run seed:factions");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

if (EXECUTE && MONGODB_URI) {
  try {
    const host = new URL(MONGODB_URI).host;
    console.log(`[seed-factions] WRITE 대상 호스트: ${host}`);
  } catch {
    console.log("[seed-factions] WRITE 모드 (MONGODB_URI 호스트 파싱 실패)");
  }
}

/* ── 타입 ── */

type FactionCode = (typeof FACTIONS)[number]["code"];

interface SeedPlan {
  code: string;
  slug: string;
  label: string;
  labelEn: string;
  summary: string;
  action: "insert" | "update" | "예상 insert" | "예상 update" | "예상 미상";
  payload: CreateFactionInput;
}

/* ── 유틸 ── */

function codeToSlug(code: string): string {
  return code.toLowerCase().replace(/_/g, "-");
}

function buildPayload(entry: (typeof FACTIONS)[number]): CreateFactionInput {
  const code = entry.code as FactionCode;
  const summary = FACTION_DEFAULT_SUMMARIES[code];
  if (!summary) {
    throw new Error(
      `[seed-factions] ${entry.code}에 summary 누락 — FACTION_DEFAULT_SUMMARIES에 엔트리 추가 필요.`,
    );
  }
  return {
    code: entry.code,
    slug: codeToSlug(entry.code),
    label: entry.label,
    labelEn: entry.labelEn,
    summary,
    isPublic: true,
    source: SEED_SOURCE,
    tags: [],
  };
}

function printPlanRow(plan: SeedPlan): void {
  // 이모지/유니코드 화살표 제거 → ASCII marker 사용 (비-TTY 로그/CI 환경 호환)
  const marker = plan.action.startsWith("예상") ? "[plan]" : "[done]";
  console.log(
    `  ${marker} ${plan.code.padEnd(12)} | ${plan.slug.padEnd(10)} | ${plan.label.padEnd(6)} | ${plan.labelEn.padEnd(16)} | ${plan.action}`,
  );
  if (VERBOSE) {
    console.log(`     payload: ${JSON.stringify(plan.payload, null, 2)}`);
  }
}

/* ── 메인 ── */

async function main(): Promise<void> {
  console.log(
    `[seed-factions] ${DRY_RUN ? "DRY-RUN" : "WRITE"} 모드 | total=${FACTIONS.length}`,
  );

  // 환경변수 체크
  if (!MONGODB_URI) {
    if (DRY_RUN) {
      console.warn(
        "[seed-factions] MONGODB_URI 미설정 — DB 조회 생략하고 계획만 출력합니다.",
      );
      for (const entry of FACTIONS) {
        const payload = buildPayload(entry);
        printPlanRow({
          code: entry.code,
          slug: payload.slug,
          label: payload.label,
          labelEn: payload.labelEn ?? "",
          summary: payload.summary,
          action: "예상 미상",
          payload,
        });
      }
      console.log("\n[seed-factions] 연결 없이 dry-run 종료 (exit 0).");
      return;
    }
    console.error("[seed-factions] MONGODB_URI 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  // DB 연결 (dry-run도 upsert 판정 위해 읽기용 연결).
  // NOTE: P3-5(unreachable URI 시 timeout 단축)는 shared-db의 initServerless가
  // serverSelectionTimeoutMS 를 아직 투과하지 않아 이번 라운드에서는 적용 보류.
  // 기본값(30s)이 그대로 적용되므로 도달 불가 URI에서 dry-run도 최대 30초 대기한다.
  try {
    initServerless({ uri: MONGODB_URI, dbName: DB_NAME });
  } catch (err) {
    console.error("[seed-factions] initServerless 실패:", err);
    if (DRY_RUN) {
      console.warn("[seed-factions] dry-run: 연결 없이 계획만 출력합니다.");
      for (const entry of FACTIONS) {
        const payload = buildPayload(entry);
        printPlanRow({
          code: entry.code,
          slug: payload.slug,
          label: payload.label,
          labelEn: payload.labelEn ?? "",
          summary: payload.summary,
          action: "예상 미상",
          payload,
        });
      }
      return;
    }
    process.exit(1);
  }

  // 실제 실행 모드에서만 인덱스 보장
  if (EXECUTE) {
    try {
      console.log("[seed-factions] ensureAllIndexes() 실행 중...");
      await ensureAllIndexes();
    } catch (err) {
      console.error("[seed-factions] ensureAllIndexes 실패:", err);
      await closeServerless().catch(() => {});
      process.exit(1);
    }
  }

  let inserted = 0;
  let updated = 0;

  try {
    for (const entry of FACTIONS) {
      const payload = buildPayload(entry);

      if (DRY_RUN) {
        // DB 읽기만: 존재 여부로 insert/update 예상 판정
        let existing = null;
        try {
          existing = await getFactionByCode(payload.code);
        } catch (err) {
          console.warn(
            `[seed-factions] ${payload.code} 존재 조회 실패 (계속 진행):`,
            err,
          );
        }
        printPlanRow({
          code: payload.code,
          slug: payload.slug,
          label: payload.label,
          labelEn: payload.labelEn ?? "",
          summary: payload.summary,
          action: existing ? "예상 update" : "예상 insert",
          payload,
        });
        if (existing) updated++;
        else inserted++;
        continue;
      }

      // 실제 실행
      const result = await upsertFactionByCode(payload);
      printPlanRow({
        code: payload.code,
        slug: payload.slug,
        label: payload.label,
        labelEn: payload.labelEn ?? "",
        summary: payload.summary,
        action: result.inserted ? "insert" : "update",
        payload,
      });
      if (result.inserted) inserted++;
      else updated++;
    }
  } catch (err) {
    console.error("[seed-factions] 처리 중 에러:", err);
    console.log(
      `[seed-factions] 중단 시점까지 처리: inserted=${inserted} updated=${updated}`,
    );
    await closeServerless().catch(() => {});
    process.exit(1);
  }

  console.log(
    `\n[seed-factions] ${DRY_RUN ? "DRY-RUN 완료" : "완료"}: inserted=${inserted} updated=${updated} total=${inserted + updated}`,
  );
  await closeServerless().catch(() => {});
}

/**
 * shared-db 의 close()는 long-running 모드만 처리한다.
 * 서버리스 모드에서 cli 프로세스를 종료하려면 globalThis 캐시에 있는 client를
 * 직접 close해야 프로세스가 끝난다.
 */
async function closeServerless(): Promise<void> {
  try {
    const client = await getClient();
    await client.close();
  } catch {
    // init 실패 등으로 client가 없으면 무시
  }
}

main().catch((err) => {
  console.error("[seed-factions] fatal:", err);
  process.exit(1);
});
