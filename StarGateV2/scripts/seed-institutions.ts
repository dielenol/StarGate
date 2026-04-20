/**
 * 기관(institutions) 컬렉션 seed 스크립트
 *
 * `packages/shared-db/src/types/character.ts` 의 INSTITUTIONS 상수를 DB로 승격한다.
 * subUnits는 신 스키마 institutionSubUnitSchema 형식으로 매핑한다.
 *
 * 사용법 (opt-in 쓰기 모드):
 *   pnpm run seed:institutions                                # dry-run (기본)
 *   pnpm run seed:institutions -- --dry-run -v                # + payload 전문 출력
 *   pnpm run seed:institutions -- --execute --yes             # 실제 쓰기
 *   pnpm run seed:institutions -- --execute --yes --verbose   # 실제 쓰기 + 전문 출력
 *
 * --execute 단독으로는 실행 거부 (--yes 누락 시 exit 1). seed-admin.ts 패턴 거울.
 *
 * 환경변수: MONGODB_URI (실행 시 필수, dry-run은 .env.local 부재면 계획만 출력)
 *
 * 실행 도구: `node --experimental-strip-types` (Node 22.6+, 안정적으로 24+).
 * tsx 4.21은 workspace ESM + exports 필드 조합에서 ERR_PACKAGE_PATH_NOT_EXPORTED로 실패하여
 * 2026-04-20 복귀 시도 후 다시 roll back했다. package.json의 engines.node 에서 22.6+ 명시.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import {
  INSTITUTIONS,
  ensureAllIndexes,
  getClient,
  getInstitutionByCode,
  initServerless,
  upsertInstitutionByCode,
  type CreateInstitutionInput,
} from "@stargate/shared-db";

/* ── 상수 ── */

/** seed 스크립트가 source 필드에 고정적으로 쓰는 값. */
const SEED_SOURCE = "manual" as const;

/** INSTITUTIONS 상수에 summary가 없으므로 한 줄 디폴트. */
const INSTITUTION_DEFAULT_SUMMARIES: Record<
  (typeof INSTITUTIONS)[number]["code"],
  string
> = {
  SECRETARIAT:
    "세계이사회 직속 사무국. 연구·행정·국제·통제 기구를 총괄하는 실무 허브.",
  FINANCE: "세계이사회 산하 재무국. 크레딧·예산 및 상업 독점 관련 승인 축.",
};

/**
 * INSTITUTIONS 상위 기관 → 소속 세력(FACTIONS.code) 매핑.
 * 현재 설계상 두 기관 모두 이사회(COUNCIL) 산하.
 */
const PARENT_FACTION_BY_CODE: Record<
  (typeof INSTITUTIONS)[number]["code"],
  string | undefined
> = {
  SECRETARIAT: "COUNCIL",
  FINANCE: "COUNCIL",
};

/* ── .env.local 로드 ──
   `=== undefined` 로 빈 문자열("")을 unset 취급하지 않도록 방어. */

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
  // .env.local 부재 — dry-run은 계속 진행
}

/* ── CLI 플래그 ──
   기본: dry-run. 실제 실행은 --execute + --yes 2개 모두 필요. */

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const DRY_RUN = !EXECUTE;
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

if (EXECUTE && !YES) {
  console.error(
    "[seed-institutions] --execute 시 --yes 로 명시적 확인이 필요합니다.",
  );
  console.error(
    "  실제 쓰기: pnpm run seed:institutions -- --execute --yes",
  );
  console.error("  dry-run 기본: pnpm run seed:institutions");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

if (EXECUTE && MONGODB_URI) {
  try {
    const host = new URL(MONGODB_URI).host;
    console.log(`[seed-institutions] WRITE 대상 호스트: ${host}`);
  } catch {
    console.log(
      "[seed-institutions] WRITE 모드 (MONGODB_URI 호스트 파싱 실패)",
    );
  }
}

/* ── 타입 ── */

type InstitutionCode = (typeof INSTITUTIONS)[number]["code"];

interface SeedPlan {
  code: string;
  slug: string;
  label: string;
  labelEn: string;
  parentFactionCode: string | undefined;
  subUnitCount: number;
  action: "insert" | "update" | "예상 insert" | "예상 update" | "예상 미상";
  payload: CreateInstitutionInput;
}

/* ── 유틸 ── */

function codeToSlug(code: string): string {
  return code.toLowerCase().replace(/_/g, "-");
}

function buildPayload(
  entry: (typeof INSTITUTIONS)[number],
): CreateInstitutionInput {
  const code = entry.code as InstitutionCode;
  const summary = INSTITUTION_DEFAULT_SUMMARIES[code];
  if (!summary) {
    throw new Error(
      `[seed-institutions] ${entry.code}에 summary 누락 — INSTITUTION_DEFAULT_SUMMARIES에 엔트리 추가 필요.`,
    );
  }

  // readonly tuple → mutable array 로 변환 (스키마는 readonly 허용 안 함)
  const subUnits = entry.subUnits.map((su) => ({
    code: su.code,
    label: su.label,
    // labelEn은 현재 INSTITUTIONS const subUnits 항목에 없음 → 생략
  }));

  return {
    code: entry.code,
    slug: codeToSlug(entry.code),
    label: entry.label,
    labelEn: entry.labelEn,
    parentFactionCode: PARENT_FACTION_BY_CODE[code],
    subUnits,
    summary,
    isPublic: true,
    source: SEED_SOURCE,
    tags: [],
  };
}

function printPlanRow(plan: SeedPlan): void {
  const marker = plan.action.startsWith("예상") ? "[plan]" : "[done]";
  console.log(
    `  ${marker} ${plan.code.padEnd(12)} | ${plan.slug.padEnd(12)} | ${plan.label.padEnd(6)} | parent=${(plan.parentFactionCode ?? "-").padEnd(8)} | subUnits=${plan.subUnitCount} | ${plan.action}`,
  );
  if (VERBOSE) {
    console.log(`     payload: ${JSON.stringify(plan.payload, null, 2)}`);
  }
}

/* ── 메인 ── */

async function main(): Promise<void> {
  console.log(
    `[seed-institutions] ${DRY_RUN ? "DRY-RUN" : "WRITE"} 모드 | total=${INSTITUTIONS.length}`,
  );

  // 환경변수 체크
  if (!MONGODB_URI) {
    if (DRY_RUN) {
      console.warn(
        "[seed-institutions] MONGODB_URI 미설정 — DB 조회 생략하고 계획만 출력합니다.",
      );
      for (const entry of INSTITUTIONS) {
        const payload = buildPayload(entry);
        printPlanRow({
          code: entry.code,
          slug: payload.slug,
          label: payload.label,
          labelEn: payload.labelEn ?? "",
          parentFactionCode: payload.parentFactionCode,
          subUnitCount: payload.subUnits?.length ?? 0,
          action: "예상 미상",
          payload,
        });
      }
      console.log("\n[seed-institutions] 연결 없이 dry-run 종료 (exit 0).");
      return;
    }
    console.error(
      "[seed-institutions] MONGODB_URI 환경변수가 설정되지 않았습니다.",
    );
    process.exit(1);
  }

  // DB 연결.
  // NOTE: P3-5(unreachable URI 시 timeout 단축)는 shared-db의 initServerless가
  // serverSelectionTimeoutMS 를 아직 투과하지 않아 이번 라운드에서는 적용 보류.
  try {
    initServerless({ uri: MONGODB_URI, dbName: DB_NAME });
  } catch (err) {
    console.error("[seed-institutions] initServerless 실패:", err);
    if (DRY_RUN) {
      console.warn("[seed-institutions] dry-run: 연결 없이 계획만 출력합니다.");
      for (const entry of INSTITUTIONS) {
        const payload = buildPayload(entry);
        printPlanRow({
          code: entry.code,
          slug: payload.slug,
          label: payload.label,
          labelEn: payload.labelEn ?? "",
          parentFactionCode: payload.parentFactionCode,
          subUnitCount: payload.subUnits?.length ?? 0,
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
      console.log("[seed-institutions] ensureAllIndexes() 실행 중...");
      await ensureAllIndexes();
    } catch (err) {
      console.error("[seed-institutions] ensureAllIndexes 실패:", err);
      await closeServerless().catch(() => {});
      process.exit(1);
    }
  }

  let inserted = 0;
  let updated = 0;

  try {
    for (const entry of INSTITUTIONS) {
      const payload = buildPayload(entry);

      if (DRY_RUN) {
        let existing = null;
        try {
          existing = await getInstitutionByCode(payload.code);
        } catch (err) {
          console.warn(
            `[seed-institutions] ${payload.code} 존재 조회 실패 (계속 진행):`,
            err,
          );
        }
        printPlanRow({
          code: payload.code,
          slug: payload.slug,
          label: payload.label,
          labelEn: payload.labelEn ?? "",
          parentFactionCode: payload.parentFactionCode,
          subUnitCount: payload.subUnits?.length ?? 0,
          action: existing ? "예상 update" : "예상 insert",
          payload,
        });
        if (existing) updated++;
        else inserted++;
        continue;
      }

      const result = await upsertInstitutionByCode(payload);
      printPlanRow({
        code: payload.code,
        slug: payload.slug,
        label: payload.label,
        labelEn: payload.labelEn ?? "",
        parentFactionCode: payload.parentFactionCode,
        subUnitCount: payload.subUnits?.length ?? 0,
        action: result.inserted ? "insert" : "update",
        payload,
      });
      if (result.inserted) inserted++;
      else updated++;
    }
  } catch (err) {
    console.error("[seed-institutions] 처리 중 에러:", err);
    console.log(
      `[seed-institutions] 중단 시점까지 처리: inserted=${inserted} updated=${updated}`,
    );
    await closeServerless().catch(() => {});
    process.exit(1);
  }

  console.log(
    `\n[seed-institutions] ${DRY_RUN ? "DRY-RUN 완료" : "완료"}: inserted=${inserted} updated=${updated} total=${inserted + updated}`,
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
  console.error("[seed-institutions] fatal:", err);
  process.exit(1);
});
