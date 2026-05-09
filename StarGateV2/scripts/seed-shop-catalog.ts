/**
 * 편의점(shop) 카탈로그 seed 스크립트
 *
 * `lib/shop/catalog.ts` 의 SHOP_CATALOG (13 품목) 을 master_items 컬렉션에 slug 기준으로
 * upsert 한다. tia_bot SHOP_ITEMS 의 TS 포팅 결과를 그대로 DB로 승격하는 일회성+멱등 스크립트.
 *
 * 사용법 (opt-in 쓰기 모드):
 *   pnpm run seed:shop                                # dry-run (기본, DB 읽기만)
 *   pnpm run seed:shop -- --dry-run -v                # + payload 전문 출력
 *   pnpm run seed:shop -- --execute --yes             # 실제 쓰기 (명시적 2-플래그)
 *   pnpm run seed:shop -- --execute --yes --verbose   # 실제 쓰기 + 전문 출력
 *
 * --execute 단독으로는 실행 거부 (--yes 누락 시 exit 1). seed-factions.ts 패턴 거울.
 *
 * 환경변수: MONGODB_URI (실행 시 필수, dry-run은 .env.local 부재면 계획만 출력)
 *
 * 실행 도구: `node --experimental-strip-types` (Node 22.6+).
 *
 * 매핑 규칙:
 *   - filter: { slug: item.slug }
 *   - $set: name / category("CONSUMABLE") / description / price / effect / isAvailable(true)
 *           / slug / shopMeta(stockMin,stockMax,appearRate,color,pageGroup) / updatedAt
 *   - $setOnInsert: createdAt
 *   - icon 은 shopMeta 에 저장하지 않음 (이모지는 카탈로그 상수에서만 참조)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import {
  ensureAllIndexes,
  getClient,
  initServerless,
  masterItemsCol,
} from "@stargate/shared-db";

import { SHOP_CATALOG, type ShopCatalogItem } from "../lib/shop/catalog.ts";

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
    "[seed-shop] --execute 시 --yes 로 명시적 확인이 필요합니다.",
  );
  console.error("  실제 쓰기: pnpm run seed:shop -- --execute --yes");
  console.error("  dry-run 기본: pnpm run seed:shop");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

if (EXECUTE && MONGODB_URI) {
  try {
    const host = new URL(MONGODB_URI).host;
    console.log(`[seed-shop] WRITE 대상 호스트: ${host}`);
  } catch {
    console.log("[seed-shop] WRITE 모드 (MONGODB_URI 호스트 파싱 실패)");
  }
}

/* ── 타입 ── */

type SeedAction = "insert" | "update" | "예상 insert" | "예상 update" | "예상 미상";

interface SeedPlan {
  slug: string;
  name: string;
  pageGroup: string;
  price: number;
  action: SeedAction;
  setPayload: Record<string, unknown>;
}

/* ── 유틸 ── */

function buildSetPayload(item: ShopCatalogItem): Record<string, unknown> {
  return {
    name: item.name,
    category: "CONSUMABLE" as const,
    description: item.description,
    price: item.price,
    effect: item.effect,
    isAvailable: true,
    slug: item.slug,
    shopMeta: {
      stockMin: item.stockMin,
      stockMax: item.stockMax,
      appearRate: item.appearRate,
      color: item.color,
      pageGroup: item.pageGroup,
    },
    updatedAt: new Date(),
  };
}

function printPlanRow(plan: SeedPlan): void {
  // ASCII marker (비-TTY 로그 / CI 호환)
  const marker = plan.action.startsWith("예상") ? "[plan]" : "[done]";
  console.log(
    `  ${marker} ${plan.slug.padEnd(14)} | ${plan.name.padEnd(12)} | ${plan.pageGroup.padEnd(8)} | price=${String(plan.price).padStart(4)} | ${plan.action}`,
  );
  if (VERBOSE) {
    console.log(`     $set: ${JSON.stringify(plan.setPayload, null, 2)}`);
  }
}

/* ── 메인 ── */

async function main(): Promise<void> {
  console.log(
    `[seed-shop] ${DRY_RUN ? "DRY-RUN" : "WRITE"} 모드 | total=${SHOP_CATALOG.length}`,
  );

  // 카탈로그 slug 중복 가드 — DB 도달 전 fail-fast.
  const slugs = SHOP_CATALOG.map((i) => i.slug);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dupes.length > 0) {
    console.error(
      `[seed-shop] catalog 에 중복 slug 발견: ${[...new Set(dupes)].join(", ")}`,
    );
    process.exit(1);
  }

  // 환경변수 체크
  if (!MONGODB_URI) {
    if (DRY_RUN) {
      console.warn(
        "[seed-shop] MONGODB_URI 미설정 — DB 조회 생략하고 계획만 출력합니다.",
      );
      for (const item of SHOP_CATALOG) {
        printPlanRow({
          slug: item.slug,
          name: item.name,
          pageGroup: item.pageGroup,
          price: item.price,
          action: "예상 미상",
          setPayload: buildSetPayload(item),
        });
      }
      console.log("\n[seed-shop] 연결 없이 dry-run 종료 (exit 0).");
      return;
    }
    console.error("[seed-shop] MONGODB_URI 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  // DB 연결 (dry-run도 upsert 판정 위해 읽기용 연결)
  try {
    initServerless({ uri: MONGODB_URI, dbName: DB_NAME });
  } catch (err) {
    console.error("[seed-shop] initServerless 실패:", err);
    if (DRY_RUN) {
      console.warn("[seed-shop] dry-run: 연결 없이 계획만 출력합니다.");
      for (const item of SHOP_CATALOG) {
        printPlanRow({
          slug: item.slug,
          name: item.name,
          pageGroup: item.pageGroup,
          price: item.price,
          action: "예상 미상",
          setPayload: buildSetPayload(item),
        });
      }
      return;
    }
    process.exit(1);
  }

  // 실제 실행 모드에서만 인덱스 보장 (seed-factions.ts 패턴 거울).
  if (EXECUTE) {
    try {
      console.log("[seed-shop] ensureAllIndexes() 실행 중...");
      await ensureAllIndexes();
    } catch (err) {
      console.error("[seed-shop] ensureAllIndexes 실패:", err);
      await closeServerless().catch(() => {});
      process.exit(1);
    }
  }

  let inserted = 0;
  let updated = 0;

  try {
    const col = await masterItemsCol();

    for (const item of SHOP_CATALOG) {
      const setPayload = buildSetPayload(item);

      if (DRY_RUN) {
        // DB 읽기만: slug 존재 여부로 insert/update 예상 판정
        let existing = null;
        try {
          existing = await col.findOne({ slug: item.slug });
        } catch (err) {
          console.warn(
            `[seed-shop] ${item.slug} 존재 조회 실패 (계속 진행):`,
            err,
          );
        }
        printPlanRow({
          slug: item.slug,
          name: item.name,
          pageGroup: item.pageGroup,
          price: item.price,
          action: existing ? "예상 update" : "예상 insert",
          setPayload,
        });
        if (existing) updated++;
        else inserted++;
        continue;
      }

      // 실제 실행 — slug 기준 upsert
      const result = await col.updateOne(
        { slug: item.slug },
        {
          $set: setPayload,
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );

      const wasInserted = result.upsertedCount > 0;
      printPlanRow({
        slug: item.slug,
        name: item.name,
        pageGroup: item.pageGroup,
        price: item.price,
        action: wasInserted ? "insert" : "update",
        setPayload,
      });
      if (wasInserted) inserted++;
      else updated++;
    }
  } catch (err) {
    console.error("[seed-shop] 처리 중 에러:", err);
    console.log(
      `[seed-shop] 중단 시점까지 처리: inserted=${inserted} updated=${updated}`,
    );
    await closeServerless().catch(() => {});
    process.exit(1);
  }

  console.log(
    `\n[seed-shop] ${DRY_RUN ? "DRY-RUN 완료" : "완료"}: inserted=${inserted} updated=${updated} total=${inserted + updated}`,
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

main().catch(async (err) => {
  console.error("[seed-shop] fatal:", err);
  await closeServerless().catch(() => {});
  process.exit(1);
});
