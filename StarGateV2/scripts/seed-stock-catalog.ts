/**
 * 주식(stocks) 카탈로그 seed 스크립트
 *
 * `lib/stocks/catalog.ts` 의 STOCK_CATALOG (9 종목) 을 stock_prices 컬렉션에
 * ticker 기준으로 멱등 upsert 한다. tia_bot STOCKS 의 TS 포팅 결과를 ERP 단독 운영
 * 환경에서도 그대로 DB로 승격하는 일회성+멱등 스크립트.
 *
 * 사용법 (opt-in 쓰기 모드):
 *   pnpm run seed:stocks                                # dry-run (기본, DB 읽기만)
 *   pnpm run seed:stocks -- --dry-run -v                # + payload 전문 출력
 *   pnpm run seed:stocks -- --execute --yes             # 실제 쓰기 (명시적 2-플래그)
 *   pnpm run seed:stocks -- --execute --yes --verbose   # 실제 쓰기 + 전문 출력
 *
 * --execute 단독으로는 실행 거부 (--yes 누락 시 exit 1). seed-shop-catalog.ts 패턴 거울.
 *
 * 환경변수: MONGODB_URI (실행 시 필수, dry-run은 .env.local 부재면 계획만 출력).
 *
 * 실행 도구: `node --experimental-strip-types` (Node 22.6+).
 *
 * 매핑 규칙:
 *   stock_prices:
 *     - filter: { ticker: item.ticker }
 *     - $setOnInsert: ticker / price(=basePrice) / prevPrice(=basePrice)
 *                     / lastUpdate(KST today) / eventText("초기 상장")
 *     - upsert: true   (기존 가격은 보존 — basePrice 로 reset 하지 않음.)
 *
 *   stock_price_history:
 *     - 신규 insert 된 ticker 에 한해 baseline row 1건 insert
 *       (source: "scheduled", price=prevPrice=basePrice, eventText: "초기 상장").
 *     - 이미 시드된 종목은 history baseline 건너뜀.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import {
  ensureAllIndexes,
  getClient,
  initServerless,
  recordStockPriceHistory,
  stockPricesCol,
} from "@stargate/shared-db";

import {
  STOCK_CATALOG,
  type StockCatalogItem,
} from "../lib/stocks/catalog.ts";

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
    "[seed-stocks] --execute 시 --yes 로 명시적 확인이 필요합니다.",
  );
  console.error("  실제 쓰기: pnpm run seed:stocks -- --execute --yes");
  console.error("  dry-run 기본: pnpm run seed:stocks");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

if (EXECUTE && MONGODB_URI) {
  try {
    const host = new URL(MONGODB_URI).host;
    console.log(`[seed-stocks] WRITE 대상 호스트: ${host}`);
  } catch {
    console.log("[seed-stocks] WRITE 모드 (MONGODB_URI 호스트 파싱 실패)");
  }
}

/* ── 상수 ── */

const KST_TIMEZONE = "Asia/Seoul";
const INITIAL_EVENT_TEXT = "초기 상장";

/* ── 타입 ── */

type SeedAction = "insert" | "skip(existing)" | "예상 insert" | "예상 skip" | "예상 미상";

interface SeedPlan {
  ticker: string;
  name: string;
  basePrice: number;
  action: SeedAction;
  insertPayload: Record<string, unknown>;
}

/* ── 유틸 ── */

/**
 * lastUpdate 표시용 KST 'YYYY-MM-DD HH:mm' 문자열 (tia_bot 호환 포맷).
 *
 * Date 의 getMonth/Day/getHours 는 서버 OS 타임존에 의존하므로
 * Intl.DateTimeFormat 의 Asia/Seoul 로직을 사용.
 */
function kstNowTag(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // hour="2-digit" + hour12=false 가 24 를 반환할 수 있으므로 mod 24 보정.
  const hour = String(Number.parseInt(get("hour") || "0", 10) % 24).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
}

function buildInsertPayload(
  item: StockCatalogItem,
  lastUpdateTag: string,
): Record<string, unknown> {
  return {
    ticker: item.ticker,
    price: item.basePrice,
    prevPrice: item.basePrice,
    eventText: INITIAL_EVENT_TEXT,
    lastUpdate: lastUpdateTag,
  };
}

function printPlanRow(plan: SeedPlan): void {
  // ASCII marker (비-TTY 로그 / CI 호환)
  const marker = plan.action.startsWith("예상") ? "[plan]" : "[done]";
  console.log(
    `  ${marker} ${plan.ticker.padEnd(4)} | ${plan.name.padEnd(12)} | basePrice=${String(plan.basePrice).padStart(5)} | ${plan.action}`,
  );
  if (VERBOSE) {
    console.log(`     $setOnInsert: ${JSON.stringify(plan.insertPayload, null, 2)}`);
  }
}

/* ── 메인 ── */

async function main(): Promise<void> {
  console.log(
    `[seed-stocks] ${DRY_RUN ? "DRY-RUN" : "WRITE"} 모드 | total=${STOCK_CATALOG.length}`,
  );

  // 카탈로그 ticker 중복 가드 — DB 도달 전 fail-fast.
  const tickers = STOCK_CATALOG.map((i) => i.ticker);
  const dupes = tickers.filter((t, i) => tickers.indexOf(t) !== i);
  if (dupes.length > 0) {
    console.error(
      `[seed-stocks] catalog 에 중복 ticker 발견: ${[...new Set(dupes)].join(", ")}`,
    );
    process.exit(1);
  }

  // 환경변수 체크
  if (!MONGODB_URI) {
    if (DRY_RUN) {
      console.warn(
        "[seed-stocks] MONGODB_URI 미설정 — DB 조회 생략하고 계획만 출력합니다.",
      );
      const lastUpdateTag = kstNowTag();
      for (const item of STOCK_CATALOG) {
        printPlanRow({
          ticker: item.ticker,
          name: item.name,
          basePrice: item.basePrice,
          action: "예상 미상",
          insertPayload: buildInsertPayload(item, lastUpdateTag),
        });
      }
      console.log("\n[seed-stocks] 연결 없이 dry-run 종료 (exit 0).");
      return;
    }
    console.error("[seed-stocks] MONGODB_URI 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  // DB 연결 (dry-run도 upsert 판정 위해 읽기용 연결)
  try {
    initServerless({ uri: MONGODB_URI, dbName: DB_NAME });
  } catch (err) {
    console.error("[seed-stocks] initServerless 실패:", err);
    if (DRY_RUN) {
      console.warn("[seed-stocks] dry-run: 연결 없이 계획만 출력합니다.");
      const lastUpdateTag = kstNowTag();
      for (const item of STOCK_CATALOG) {
        printPlanRow({
          ticker: item.ticker,
          name: item.name,
          basePrice: item.basePrice,
          action: "예상 미상",
          insertPayload: buildInsertPayload(item, lastUpdateTag),
        });
      }
      return;
    }
    process.exit(1);
  }

  // 실제 실행 모드에서만 인덱스 보장 (seed-shop-catalog.ts 패턴 거울).
  if (EXECUTE) {
    try {
      console.log("[seed-stocks] ensureAllIndexes() 실행 중...");
      await ensureAllIndexes();
    } catch (err) {
      console.error("[seed-stocks] ensureAllIndexes 실패:", err);
      await closeServerless().catch(() => {});
      process.exit(1);
    }
  }

  let inserted = 0;
  let skipped = 0;
  let historyBaseline = 0;
  const lastUpdateTag = kstNowTag();

  try {
    const col = await stockPricesCol();

    for (const item of STOCK_CATALOG) {
      const insertPayload = buildInsertPayload(item, lastUpdateTag);

      if (DRY_RUN) {
        // DB 읽기만: ticker 존재 여부로 insert/skip 예상 판정
        let existing = null;
        try {
          existing = await col.findOne({ ticker: item.ticker });
        } catch (err) {
          console.warn(
            `[seed-stocks] ${item.ticker} 존재 조회 실패 (계속 진행):`,
            err,
          );
        }
        printPlanRow({
          ticker: item.ticker,
          name: item.name,
          basePrice: item.basePrice,
          action: existing ? "예상 skip" : "예상 insert",
          insertPayload,
        });
        if (existing) skipped++;
        else inserted++;
        continue;
      }

      // 실제 실행 — ticker 기준 멱등 upsert. $setOnInsert 만 사용 → 기존 가격 보존.
      const result = await col.updateOne(
        { ticker: item.ticker },
        { $setOnInsert: insertPayload },
        { upsert: true },
      );

      const wasInserted = result.upsertedCount > 0;
      printPlanRow({
        ticker: item.ticker,
        name: item.name,
        basePrice: item.basePrice,
        action: wasInserted ? "insert" : "skip(existing)",
        insertPayload,
      });
      if (wasInserted) {
        inserted++;
        // 신규 시드된 ticker 에만 baseline history row 1건.
        try {
          await recordStockPriceHistory({
            ticker: item.ticker,
            price: item.basePrice,
            prevPrice: item.basePrice,
            eventText: INITIAL_EVENT_TEXT,
            source: "scheduled",
          });
          historyBaseline++;
        } catch (err) {
          console.warn(
            `[seed-stocks] ${item.ticker} baseline history 기록 실패 (계속 진행):`,
            err,
          );
        }
      } else {
        skipped++;
      }
    }
  } catch (err) {
    console.error("[seed-stocks] 처리 중 에러:", err);
    console.log(
      `[seed-stocks] 중단 시점까지 처리: inserted=${inserted} skipped=${skipped} history=${historyBaseline}`,
    );
    await closeServerless().catch(() => {});
    process.exit(1);
  }

  console.log(
    `\n[seed-stocks] ${DRY_RUN ? "DRY-RUN 완료" : "완료"}: ` +
      `inserted=${inserted} skipped=${skipped} history-baseline=${historyBaseline} total=${inserted + skipped}`,
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
  console.error("[seed-stocks] fatal:", err);
  await closeServerless().catch(() => {});
  process.exit(1);
});
